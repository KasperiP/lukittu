import {
  generateHMAC,
  getLicenseStatus,
  LicenseStatus,
  logger,
  prisma,
  publishDiscordSync,
  regex,
} from '@lukittu/shared';
import { ApplicationCommandOptionType, Colors, EmbedBuilder } from 'discord.js';
import { Command } from '../../structures/command';

export default Command({
  data: {
    name: 'verify',
    description: 'Verify using valid license key to link your Discord account',
    ephemeral: true,
    dm_permission: false, // Guild only
    options: [
      {
        name: 'license',
        description: 'Your license key',
        type: ApplicationCommandOptionType.String,
        required: true,
        min_length: 29, // Example: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX (5x5 + 4 hyphens = 29)
        max_length: 29,
      },
    ],
  },
  execute: async (interaction) => {
    try {
      // Verify this is in a guild context
      if (!interaction.guild) {
        await interaction.editReply({
          content: 'This command can only be used in a server.',
        });
        return;
      }

      const licenseKeyInput = interaction.options.getString('license', true);

      // Validate license key format
      if (!regex.licenseKey.test(licenseKeyInput)) {
        await interaction.editReply({
          content:
            'Invalid license key format. Please check your license key and try again.',
        });
        logger.info('Verify command failed - invalid format', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
        });
        return;
      }

      // Fetch all product roles for this guild
      const productRoleMatches = await prisma.productDiscordRole.findMany({
        where: {
          guildId: interaction.guild.id,
          team: {
            deletedAt: null,
          },
        },
      });

      if (productRoleMatches.length === 0) {
        await interaction.editReply({
          content:
            'No products with Discord roles are configured for this server.',
        });
        logger.info('Verify command failed - no product roles in guild', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
        });
        return;
      }

      // Generate HMAC hash for lookups
      const licenseKeyLookups = productRoleMatches.map((role) =>
        generateHMAC(`${licenseKeyInput}:${role.teamId}`),
      );

      // Query database for ALL licenses with this key (can be multiple across teams)
      const matchingLicenses = await prisma.license.findMany({
        where: {
          licenseKeyLookup: {
            in: licenseKeyLookups,
          },
          team: {
            deletedAt: null,
          },
        },
        include: {
          team: {
            include: {
              discordIntegration: true,
            },
          },
          products: {
            include: {
              discordRoles: {
                where: {
                  guildId: interaction.guild.id,
                },
              },
            },
          },
          customers: {
            include: {
              discordAccount: true,
            },
          },
        },
      });

      // Check if any licenses exist
      if (matchingLicenses.length === 0) {
        await interaction.editReply({
          content:
            'License key not found. Please check your license key and try again.',
        });
        logger.info('Verify command failed - no licenses found', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
        });
        return;
      }

      // Filter valid licenses
      const validLicenses = matchingLicenses.filter((license) => {
        // Must have Discord integration enabled
        if (!license.team.discordIntegration?.active) {
          logger.warn('Discord integration inactive for team', {
            licenseId: license.id,
            teamId: license.teamId,
          });
          return false;
        }

        // Must not be suspended
        if (license.suspended) {
          logger.warn('License is suspended', {
            licenseId: license.id,
            teamId: license.teamId,
          });
          return false;
        }

        // Must not be expired
        const status = getLicenseStatus(license);
        if (
          status === LicenseStatus.EXPIRED ||
          status === LicenseStatus.SUSPENDED
        ) {
          logger.warn('License is expired or suspended', {
            licenseId: license.id,
            teamId: license.teamId,
            status,
          });
          return false;
        }

        // Must have products with Discord roles in this guild
        const hasRoles = license.products.some(
          (product) => product.discordRoles.length > 0,
        );
        if (!hasRoles) {
          logger.warn(
            'License has no products with Discord roles in this guild',
            {
              licenseId: license.id,
              teamId: license.teamId,
            },
          );
          return false;
        }

        // Must have exactly one customer
        if (license.customers.length !== 1) {
          logger.warn('License does not have exactly one customer', {
            licenseId: license.id,
            teamId: license.teamId,
          });
          return false;
        }

        return true;
      });

      if (validLicenses.length === 0) {
        await interaction.editReply({
          content:
            'No valid licenses found for verification. The license may be expired, suspended, or not configured for Discord role assignment in this server.',
        });
        logger.info('Verify command failed - no valid licenses', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          matchingLicensesCount: matchingLicenses.length,
        });
        return;
      }

      // Process each valid license and link customers
      // Note: Each valid license has exactly one customer (validated above)
      const linkedCustomers: {
        customerId: string;
        teamId: string;
        action: 'created' | 'updated';
      }[] = [];
      const errors: { teamId: string; error: string }[] = [];

      for (const license of validLicenses) {
        try {
          const customer = license.customers[0]; // Safe: validated to have exactly 1

          // Check if customer already has Discord account linked
          if (customer.discordAccount) {
            // Check if linked to a different Discord user
            if (customer.discordAccount.discordId !== interaction.user.id) {
              errors.push({
                teamId: license.teamId,
                error: 'Customer already linked to different Discord account',
              });
              logger.info('License customer already linked to different user', {
                userId: interaction.user.id,
                linkedToUserId: customer.discordAccount.discordId,
                guildId: interaction.guild.id,
                licenseId: license.id,
                customerId: customer.id,
                teamId: license.teamId,
              });
              continue;
            }

            // Update existing link (same Discord user)
            await prisma.customerDiscordAccount.update({
              where: {
                id: customer.discordAccount.id,
                teamId: license.teamId,
              },
              data: {
                username: interaction.user.username,
                globalName: interaction.user.globalName || null,
                avatar: interaction.user.avatar || null,
              },
            });

            linkedCustomers.push({
              customerId: customer.id,
              teamId: license.teamId,
              action: 'updated',
            });

            logger.info('Updated existing CustomerDiscordAccount', {
              userId: interaction.user.id,
              guildId: interaction.guild.id,
              customerId: customer.id,
              teamId: license.teamId,
              licenseId: license.id,
            });
          } else {
            // Create new CustomerDiscordAccount
            await prisma.customerDiscordAccount.create({
              data: {
                customerId: customer.id,
                discordId: interaction.user.id,
                username: interaction.user.username,
                globalName: interaction.user.globalName || null,
                avatar: interaction.user.avatar || null,
                teamId: license.teamId,
              },
            });

            linkedCustomers.push({
              customerId: customer.id,
              teamId: license.teamId,
              action: 'created',
            });

            logger.info('Created new CustomerDiscordAccount', {
              userId: interaction.user.id,
              guildId: interaction.guild.id,
              customerId: customer.id,
              teamId: license.teamId,
              licenseId: license.id,
            });
          }
        } catch (error) {
          errors.push({
            teamId: license.teamId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          logger.error('Failed to link customer for license', {
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            licenseId: license.id,
            teamId: license.teamId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // If no customers were linked, return error
      if (linkedCustomers.length === 0) {
        await interaction.editReply({
          content:
            'Unable to link any customers. All licenses may already be linked to other Discord accounts or errors occurred.',
        });
        logger.warn('Verify command failed - no customers linked', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          errorsCount: errors.length,
        });
        return;
      }

      // Trigger Discord role sync for each linked customer
      const syncResults: { teamId: string; success: boolean }[] = [];

      for (const linkedCustomer of linkedCustomers) {
        try {
          await publishDiscordSync({
            discordId: interaction.user.id,
            teamId: linkedCustomer.teamId,
          });

          syncResults.push({
            teamId: linkedCustomer.teamId,
            success: true,
          });

          logger.info('Published Discord sync for verified customer', {
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            customerId: linkedCustomer.customerId,
            teamId: linkedCustomer.teamId,
            action: linkedCustomer.action,
          });
        } catch (error) {
          syncResults.push({
            teamId: linkedCustomer.teamId,
            success: false,
          });

          logger.error('Failed to publish Discord sync', {
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            customerId: linkedCustomer.customerId,
            teamId: linkedCustomer.teamId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('License verified successfully')
        .setColor(Colors.Green)
        .setDescription(
          linkedCustomers.length === 1
            ? 'Your Discord account has been linked to your license. Your roles will be synchronized shortly.'
            : `Your Discord account has been linked to ${linkedCustomers.length} licenses across multiple teams. Your roles will be synchronized shortly.`,
        )
        .setTimestamp();

      const successfulSyncs = syncResults.filter((s) => s.success).length;
      const failedSyncs = syncResults.filter((s) => !s.success).length;

      if (successfulSyncs > 0) {
        embed.addFields({
          name: 'Role Synchronization',
          value: `${successfulSyncs} team${successfulSyncs > 1 ? 's' : ''} queued for role sync`,
        });
      }

      if (failedSyncs > 0) {
        embed.addFields({
          name: 'Sync Issues',
          value: `${failedSyncs} team${failedSyncs > 1 ? 's' : ''} failed to queue for sync. Roles may not update immediately.`,
        });
      }

      await interaction.editReply({
        embeds: [embed],
      });

      logger.info('Verify command completed successfully', {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        linkedCustomersCount: linkedCustomers.length,
        validLicensesCount: validLicenses.length,
        successfulSyncs,
        failedSyncs,
      });
    } catch (error) {
      logger.error('Verify command failed', {
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
        error: error instanceof Error ? error.message : String(error),
      });

      try {
        await interaction.editReply({
          content:
            'An error occurred while verifying your license. Please try again later.',
        });
      } catch (replyError) {
        logger.error('Failed to send error response', {
          userId: interaction.user.id,
          error:
            replyError instanceof Error
              ? replyError.message
              : String(replyError),
        });
      }
    }
  },
});
