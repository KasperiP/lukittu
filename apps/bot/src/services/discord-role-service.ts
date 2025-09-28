import {
  Customer,
  getLicenseStatus,
  License,
  LicenseStatus,
  logger,
  prisma,
  Product,
  ProductDiscordRole,
  redisClient,
} from '@lukittu/shared';
import { GuildMember } from 'discord.js';
import { getDiscordClient, isClientReady } from './discord-client';

interface RoleAssignmentData {
  roleId: string;
  productId: string;
  productName: string;
  teamId: string;
  hasActiveLicense: boolean;
}

type CustomerWithLicenses = Customer & {
  licenses: (License & {
    products: Product[];
  })[];
};

const RATE_LIMIT_WINDOW = 60; // 1 minute in seconds (for Redis TTL)

/**
 * Sync roles for a specific Discord user in a specific team
 */
export async function syncUserById(
  discordId: string,
  teamId: string,
): Promise<void> {
  const startTime = Date.now();

  try {
    logger.info('Starting Discord role sync for user in team', {
      discordId,
      teamId,
    });

    const client = getDiscordClient();
    if (!isClientReady()) {
      logger.error('Cannot sync user roles', {
        reason: 'Discord client not ready',
        discordId,
        teamId,
      });
      return;
    }

    // Find the specific customer Discord account for this user and team
    const customerDiscordAccount =
      await prisma.customerDiscordAccount.findUnique({
        where: {
          teamId_discordId: {
            teamId,
            discordId,
          },
          team: {
            deletedAt: null,
            discordIntegration: {
              active: true,
            },
          },
        },
        include: {
          customer: {
            include: {
              licenses: {
                include: {
                  products: true,
                },
              },
            },
          },
          team: {
            include: {
              discordIntegration: true,
              productDiscordRoles: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      });

    if (!customerDiscordAccount) {
      logger.info('No customer account found for Discord user in team', {
        discordId,
        teamId,
      });
      return;
    }

    logger.info('Found customer account for Discord user in team', {
      discordId,
      teamId,
      customerId: customerDiscordAccount.customerId,
    });

    // Group role mappings by guild for this specific team
    const guildRoleMappings = new Map<
      string,
      (ProductDiscordRole & {
        product: Product;
      })[]
    >();

    for (const roleMapping of customerDiscordAccount.team.productDiscordRoles ||
      []) {
      if (!guildRoleMappings.has(roleMapping.guildId)) {
        guildRoleMappings.set(roleMapping.guildId, []);
      }
      const guildMappings = guildRoleMappings.get(roleMapping.guildId);
      if (guildMappings) {
        guildMappings.push(roleMapping);
      }
    }

    // Process each guild for this team
    for (const [guildId, roleMappings] of guildRoleMappings) {
      try {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          logger.warn('Could not fetch guild for role sync', {
            guildId,
            discordId,
            teamId,
          });
          continue;
        }

        const member = await guild.members.fetch(discordId).catch(() => null);
        if (!member) {
          logger.info('User not found in guild', {
            guildId,
            discordId,
            teamId,
          });
          continue;
        }

        // Determine role assignments for this guild
        const roleAssignments: RoleAssignmentData[] = roleMappings.map(
          (mapping) => {
            const hasActiveLicense = checkActiveLicenseForProduct(
              customerDiscordAccount.customer,
              mapping.productId,
            );

            return {
              roleId: mapping.roleId,
              productId: mapping.productId,
              productName: mapping.product.name,
              teamId: mapping.teamId,
              hasActiveLicense,
            };
          },
        );

        await executeRoleChanges(member, roleAssignments);

        logger.info('Role sync completed for user in guild', {
          discordId,
          teamId,
          guildId,
          roleAssignments: roleAssignments.length,
        });
      } catch (error) {
        logger.error('Error syncing roles for user in guild', {
          discordId,
          teamId,
          guildId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const processingTime = Date.now() - startTime;
    logger.info('Discord role sync completed for user in team', {
      discordId,
      teamId,
      processingTimeMs: processingTime,
      guildsProcessed: guildRoleMappings.size,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Failed to sync roles for Discord user in team', {
      discordId,
      teamId,
      processingTimeMs: processingTime,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Start the scheduled role sync task
 */
export function startScheduledRoleSync(): void {
  if (!isClientReady()) {
    logger.error('Cannot start scheduled sync', {
      reason: 'Discord client not ready',
    });
    return;
  }

  logger.info('Starting scheduled Discord role sync task', {
    interval: '30 minutes',
  });

  // Run immediately on startup, then every 30 minutes
  scheduledRoleSync();
  setInterval(scheduledRoleSync, 30 * 60 * 1000); // 30 minutes
}

/**
 * Process when a user joins a guild
 */
export async function processUserJoin(member: GuildMember): Promise<void> {
  const startTime = Date.now();
  const userId = member.user.id;
  const guildId = member.guild.id;

  // Rate limiting check
  if (!(await checkRateLimit(userId))) {
    logger.warn('Rate limit exceeded for user', {
      userId,
      rateLimitWindow: `${RATE_LIMIT_WINDOW}s`,
    });
    return;
  }

  try {
    logger.info('Processing guild member join', {
      userId,
      guildId,
    });

    await syncUserRolesInGuild(member);

    const processingTime = Date.now() - startTime;
    logger.info('Role processing completed', {
      userId,
      guildId,
      processingTimeMs: processingTime,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Failed to process roles for user', {
      userId,
      guildId,
      processingTimeMs: processingTime,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Optimized scheduled role sync with rate limiting and error handling
 */
async function scheduledRoleSync(): Promise<void> {
  const startTime = Date.now();
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  try {
    logger.info('Starting scheduled Discord role sync', {
      startTime: new Date(startTime).toISOString(),
    });

    // Get all teams with active Discord integrations and role mappings
    const teamsWithRoleMappings = await prisma.team.findMany({
      where: {
        deletedAt: null,
        discordIntegration: {
          active: true,
        },
        productDiscordRoles: {
          some: {},
        },
      },
      include: {
        customerDiscordAccount: {
          include: {
            customer: {
              include: {
                licenses: {
                  include: {
                    products: true,
                  },
                },
              },
            },
          },
        },
        productDiscordRoles: {
          include: {
            product: true,
          },
        },
      },
    });

    logger.info('Found teams with Discord integrations', {
      teamCount: teamsWithRoleMappings.length,
    });

    // Process each team's customers
    for (const team of teamsWithRoleMappings) {
      if (team.customerDiscordAccount.length === 0) {
        continue;
      }

      logger.info('Processing customers for team', {
        teamId: team.id,
        teamName: team.name,
        customerCount: team.customerDiscordAccount.length,
      });

      // Group role mappings by guild for efficient processing
      const guildMappings = team.productDiscordRoles.reduce(
        (acc, mapping) => {
          if (!acc[mapping.guildId]) {
            acc[mapping.guildId] = [];
          }
          acc[mapping.guildId].push(mapping);
          return acc;
        },
        {} as Record<string, typeof team.productDiscordRoles>,
      );

      // Process each guild
      for (const [guildId, mappings] of Object.entries(guildMappings)) {
        try {
          const client = getDiscordClient();
          const guild = await client.guilds.fetch(guildId).catch(() => null);
          if (!guild) {
            logger.warn('Could not fetch guild', {
              guildId,
            });
            continue;
          }

          // Process customers in batches to avoid rate limits
          for (let i = 0; i < team.customerDiscordAccount.length; i += 5) {
            const batch = team.customerDiscordAccount.slice(i, i + 5);

            await Promise.all(
              batch.map(async (customerAccount) => {
                try {
                  const member = await guild.members
                    .fetch(customerAccount.discordId)
                    .catch(() => null);
                  if (!member) {
                    skipped++;
                    return;
                  }

                  // Determine role assignments for this customer
                  const roleAssignments = mappings.map((mapping) => ({
                    roleId: mapping.roleId,
                    productId: mapping.productId,
                    productName: mapping.product.name,
                    teamId: mapping.teamId,
                    hasActiveLicense: checkActiveLicenseForProduct(
                      customerAccount.customer,
                      mapping.productId,
                    ),
                  }));

                  await executeRoleChanges(member, roleAssignments);
                  processed++;
                } catch (error) {
                  logger.error('Error processing customer', {
                    discordId: customerAccount.discordId,
                    guildId,
                    error:
                      error instanceof Error ? error.message : String(error),
                  });
                  errors++;
                }
              }),
            );

            // Rate limiting: small delay between batches
            if (i + 5 < team.customerDiscordAccount.length) {
              await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
            }
          }
        } catch (error) {
          logger.error('Error processing guild for team', {
            guildId,
            teamId: team.id,
            error: error instanceof Error ? error.message : String(error),
          });
          errors++;
        }
      }

      // Delay between teams to be extra safe with rate limits
      await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 second delay
    }

    const duration = Date.now() - startTime;
    logger.info('Scheduled role sync completed', {
      durationMs: duration,
      processed,
      skipped,
      errors,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Scheduled role sync failed', {
      durationMs: duration,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Sync roles for a user in a specific guild when they join
 */
async function syncUserRolesInGuild(member: GuildMember): Promise<void> {
  const userId = member.user.id;
  const guildId = member.guild.id;

  try {
    // Get all teams that have role mappings in this guild
    const teamsWithRoleMappings = await prisma.team.findMany({
      where: {
        deletedAt: null,
        discordIntegration: {
          active: true,
        },
        productDiscordRoles: {
          some: {
            guildId,
          },
        },
        customerDiscordAccount: {
          some: {
            discordId: userId,
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (teamsWithRoleMappings.length === 0) {
      logger.info('No teams with role mappings found for user in guild', {
        userId,
        guildId,
      });
      return;
    }

    logger.info('Found teams with role mappings for user in guild', {
      userId,
      guildId,
      teamCount: teamsWithRoleMappings.length,
      teamIds: teamsWithRoleMappings.map((t) => t.id),
    });

    // Sync roles for each team individually using the optimized function
    for (const team of teamsWithRoleMappings) {
      try {
        await syncUserById(userId, team.id);
      } catch (error) {
        logger.error(
          'Failed to sync roles for user in team during guild join',
          {
            userId,
            guildId,
            teamId: team.id,
            teamName: team.name,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        // Continue with other teams even if one fails
      }
    }
  } catch (error) {
    logger.error('Failed to sync user roles in guild', {
      userId,
      guildId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Check if customer has active license for specific product
 */
function checkActiveLicenseForProduct(
  customer: CustomerWithLicenses,
  productId: string,
): boolean {
  const relevantLicenses = customer.licenses.filter((license) =>
    license.products.some((product) => product.id === productId),
  );

  const allowedStatuses = [
    LicenseStatus.ACTIVE,
    LicenseStatus.EXPIRING,
    LicenseStatus.INACTIVE, // Inactive means that the license just have not been used for a while, but is still valid
  ];

  return relevantLicenses.some((license) => {
    const status = getLicenseStatus(license);
    return allowedStatuses.includes(status);
  });
}

/**
 * Execute role assignments/removals
 */
async function executeRoleChanges(
  member: GuildMember,
  roleAssignmentData: RoleAssignmentData[],
): Promise<void> {
  const rolesToAdd: string[] = [];
  const rolesToRemove: string[] = [];

  for (const assignment of roleAssignmentData) {
    const hasRole = member.roles.cache.has(assignment.roleId);

    if (assignment.hasActiveLicense && !hasRole) {
      rolesToAdd.push(assignment.roleId);
    } else if (!assignment.hasActiveLicense && hasRole) {
      rolesToRemove.push(assignment.roleId);
    }
  }

  // Execute role additions
  for (const roleId of rolesToAdd) {
    try {
      await member.roles.add(roleId);
      const assignment = roleAssignmentData.find((a) => a.roleId === roleId);
      logger.info('Added role to user', {
        roleId,
        productName: assignment?.productName,
        userId: member.user.id,
        guildId: member.guild.id,
      });
    } catch (error) {
      logger.error('Failed to add role to user', {
        roleId,
        userId: member.user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Execute role removals
  for (const roleId of rolesToRemove) {
    try {
      await member.roles.remove(roleId);
      const assignment = roleAssignmentData.find((a) => a.roleId === roleId);
      logger.info('Removed role from user', {
        roleId,
        productName: assignment?.productName,
        userId: member.user.id,
        guildId: member.guild.id,
      });
    } catch (error) {
      logger.error('Failed to remove role from user', {
        roleId,
        userId: member.user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Rate limiting check using Redis
 */
async function checkRateLimit(userId: string): Promise<boolean> {
  const userKey = `role_ops:${userId}`;

  try {
    // Use Redis SET with NX (only set if not exists) and EX (expire) options
    // This atomically checks if key exists and sets it with TTL if it doesn't
    const result = await redisClient.set(
      userKey,
      Date.now().toString(),
      'EX',
      RATE_LIMIT_WINDOW,
      'NX',
    );

    // If result is 'OK', the key didn't exist and was set (rate limit passed)
    // If result is null, the key already existed (rate limited)
    return result === 'OK';
  } catch (error) {
    logger.error('Rate limit check failed, allowing operation', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    // On Redis error, allow the operation to proceed
    return true;
  }
}
