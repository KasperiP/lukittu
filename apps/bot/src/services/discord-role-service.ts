import {
  Customer,
  CustomerDiscordAccount,
  DiscordIntegration,
  getLicenseStatus,
  License,
  LicenseStatus,
  logger,
  prisma,
  Product,
  ProductDiscordRole,
  Team,
} from '@lukittu/shared';
import { Client, GuildMember } from 'discord.js';

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

type CustomerDiscordAccountWithData = CustomerDiscordAccount & {
  customer: CustomerWithLicenses;
  team: Team & {
    discordIntegration: DiscordIntegration | null;
    productDiscordRoles?: ProductDiscordRole[];
  };
};

type ProductDiscordRoleWithProduct = ProductDiscordRole & {
  product: Product;
  team: Team & {
    discordIntegration: DiscordIntegration | null;
  };
};

let discordClient: Client | null = null;
const rateLimitCache = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

export function setClient(client: Client): void {
  discordClient = client;
}

/**
 * Start the scheduled role sync task
 */
export function startScheduledRoleSync(): void {
  if (!discordClient) {
    logger.error('Cannot start scheduled sync', {
      reason: 'Discord client not initialized',
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
  if (!checkRateLimit(userId)) {
    logger.warn('Rate limit exceeded for user', {
      userId,
      action: 'skipping role assignment',
      rateLimitWindow: `${RATE_LIMIT_WINDOW}ms`,
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
          const guild = await discordClient?.guilds
            .fetch(guildId)
            .catch(() => null);
          if (!guild) {
            logger.warn('Could not fetch guild', {
              guildId,
              action: 'skipping',
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

  // Get all ProductDiscordRole mappings for this guild
  const rolesMappings = await prisma.productDiscordRole.findMany({
    where: {
      guildId: guildId,
      team: {
        deletedAt: null,
      },
    },
    include: {
      product: true,
      team: {
        include: {
          discordIntegration: true,
        },
      },
    },
  });

  if (rolesMappings.length === 0) {
    logger.info('No role mappings found for guild', {
      guildId,
    });
    return;
  }

  // Check if any of the teams have Discord integration enabled
  const activeRoleMappings = rolesMappings.filter(
    (mapping) => mapping.team.discordIntegration?.active === true,
  );

  if (activeRoleMappings.length === 0) {
    logger.info('No active Discord integrations found for guild', {
      guildId,
    });
    return;
  }

  // Find ALL customer Discord accounts for this user across relevant teams
  const teamIds = activeRoleMappings.map((mapping) => mapping.teamId);
  const customerDiscordAccounts = await prisma.customerDiscordAccount.findMany({
    where: {
      discordId: userId,
      teamId: {
        in: teamIds,
      },
      team: {
        deletedAt: null,
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
        },
      },
    },
  });

  if (customerDiscordAccounts.length === 0) {
    logger.info('No customer Discord accounts found for user', {
      userId,
      context: 'relevant teams',
    });
    return;
  }

  logger.info('Found customer accounts for user', {
    userId,
    accountCount: customerDiscordAccounts.length,
    teamIds: customerDiscordAccounts.map((acc) => acc.teamId),
  });

  // Process each team separately to maintain team boundaries
  const allRoleAssignments: RoleAssignmentData[] = [];

  for (const customerAccount of customerDiscordAccounts) {
    // Get only the role mappings for THIS specific team
    const teamRoleMappings = activeRoleMappings.filter(
      (mapping) => mapping.teamId === customerAccount.teamId,
    );

    if (teamRoleMappings.length === 0) {
      continue;
    }

    logger.info('Processing role mappings for team', {
      teamId: customerAccount.teamId,
      roleMappingCount: teamRoleMappings.length,
    });

    // Determine role assignments for this specific team only
    const teamRoleAssignments = await determineRoleAssignments(
      customerAccount,
      teamRoleMappings,
    );

    // Add team assignments to the overall list
    allRoleAssignments.push(...teamRoleAssignments);
  }

  // Execute all role assignments/removals
  await executeRoleChanges(member, allRoleAssignments);
}

/**
 * Determine which roles should be assigned or removed
 */
async function determineRoleAssignments(
  customerDiscordAccount: CustomerDiscordAccountWithData,
  activeRoleMappings: ProductDiscordRoleWithProduct[],
): Promise<RoleAssignmentData[]> {
  const roleAssignments: RoleAssignmentData[] = [];

  for (const roleMapping of activeRoleMappings) {
    // Check if customer has active license for this product
    const hasActiveLicense = checkActiveLicenseForProduct(
      customerDiscordAccount.customer,
      roleMapping.productId,
    );

    roleAssignments.push({
      roleId: roleMapping.roleId,
      productId: roleMapping.productId,
      productName: roleMapping.product.name,
      teamId: roleMapping.teamId,
      hasActiveLicense,
    });
  }

  return roleAssignments;
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
 * Rate limiting check
 */
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userKey = `role_ops:${userId}`;

  const lastOperation = rateLimitCache.get(userKey);

  if (!lastOperation || now - lastOperation >= RATE_LIMIT_WINDOW) {
    rateLimitCache.set(userKey, now);
    return true;
  }

  return false;
}

/**
 * Clean up expired rate limit entries
 */
export function cleanupRateLimit(): void {
  const now = Date.now();

  for (const [key, timestamp] of rateLimitCache.entries()) {
    if (now - timestamp >= RATE_LIMIT_WINDOW) {
      rateLimitCache.delete(key);
    }
  }
}

// Clean up rate limit cache every 5 minutes
setInterval(
  () => {
    cleanupRateLimit();
  },
  5 * 60 * 1000,
);
