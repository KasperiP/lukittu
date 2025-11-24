import { logger, Prisma, prisma, subscribeDiscordSync } from '@lukittu/shared';
import {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
} from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { initializeDiscordClient } from './services/discord-client';
import {
  startScheduledRoleSync,
  syncUserById,
} from './services/discord-role-service';
import { Command, LinkedDiscordAccount } from './structures/command';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.commands = new Collection<string, Command>();
const commands: Command[] = [];

// Function to load all events
async function loadEvents() {
  const eventsPath = path.join(__dirname, 'events');

  try {
    const eventFiles = fs
      .readdirSync(eventsPath)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.js'));

    for (const file of eventFiles) {
      const filePath = path.join(eventsPath, file);
      try {
        const importedEvent = await import(filePath);
        const event = importedEvent.event || importedEvent.default;

        if (event && 'name' in event && 'execute' in event) {
          if (event.once) {
            client.once(event.name, event.execute);
          } else {
            client.on(event.name, event.execute);
          }
          logger.info('Event loaded successfully', {
            eventName: event.name,
            filePath,
          });
        } else {
          logger.warn('Event missing required properties', {
            filePath,
            missingProperties: 'name or execute',
          });
        }
      } catch (error) {
        logger.error('Failed to load event', {
          filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch {
    // Events directory doesn't exist or is inaccessible
    logger.info('Events directory not found', {
      path: eventsPath,
    });
  }
}

// Function to load all commands
async function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  try {
    const commandFolders = fs
      .readdirSync(commandsPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const folder of commandFolders) {
      const folderPath = path.join(commandsPath, folder);

      try {
        const commandFiles = fs
          .readdirSync(folderPath)
          .filter((file) => file.endsWith('.ts') || file.endsWith('.js'));

        for (const file of commandFiles) {
          const filePath = path.join(folderPath, file);
          try {
            const importedCommand = await import(filePath);
            const command = importedCommand.default || importedCommand;

            // Check if the command has the required properties
            if (command && 'data' in command && 'execute' in command) {
              client.commands.set(command.data.name, command);
              commands.push(command.data);
            } else {
              logger.info('Command missing required properties', {
                filePath,
                missingProperties: 'data or execute',
              });
            }
          } catch (error) {
            logger.error('Failed to load command', {
              filePath,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (error) {
        logger.error('Failed to read command folder', {
          folderPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch {
    logger.info('Commands directory not found', {
      path: commandsPath,
    });
  }
}

// Register slash commands with Discord
async function registerCommands() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!clientId) {
    logger.error('Missing required environment variable', {
      variable: 'DISCORD_CLIENT_ID',
    });
    return;
  }

  if (!token) {
    logger.error('Missing required environment variable', {
      variable: 'DISCORD_BOT_TOKEN',
    });
    return;
  }

  const rest = new REST().setToken(token);

  try {
    logger.info('Started refreshing slash commands', {
      commandCount: commands.length,
    });

    // The route depends on whether you want to register commands globally or for a specific guild
    await rest.put(Routes.applicationCommands(clientId), { body: commands });

    logger.info('Successfully refreshed slash commands', {
      commandCount: commands.length,
    });
  } catch (error) {
    logger.error('Failed to refresh slash commands', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Function to check if the user has a linked Discord account and permission
async function checkLinkedAccountAndPermission(
  userId: string,
): Promise<LinkedDiscordAccount | null> {
  try {
    const includeData = {
      selectedTeam: {
        where: {
          deletedAt: null,
        },
        include: {
          limits: true,
          discordIntegration: true,
        },
      },
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
            },
            include: {
              discordIntegration: true,
            },
          },
        },
      },
    } satisfies Prisma.UserDiscordAccountInclude;

    const discordAccount = await prisma.userDiscordAccount.findUnique({
      where: { discordId: userId },
      include: includeData,
    });

    // If user has selected a team, check if they are still a member of that team
    // If not, set selectedTeamId to null
    if (discordAccount) {
      const selectedTeam = discordAccount.selectedTeamId;

      if (selectedTeam) {
        const isInTeam = discordAccount.user.teams.some(
          (team) => team.id === selectedTeam,
        );

        if (!isInTeam) {
          const updatedAccount = await prisma.userDiscordAccount.update({
            where: { id: discordAccount.id },
            data: { selectedTeamId: null },
            include: includeData,
          });

          logger.info('Updated user team selection', {
            userId,
            reason: 'user no longer member of selected team',
          });

          return updatedAccount;
        }
      }
    }

    return discordAccount;
  } catch (error) {
    logger.error('Failed to check linked account', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('Failed to verify linked account due to a database error');
  }
}

// Handle interactions
client.on(Events.InteractionCreate, async (interaction) => {
  // Check if the user has a linked Discord account

  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.error('Command not found', {
        commandName: interaction.commandName,
        userId: interaction.user.id,
      });
      return;
    }

    try {
      // Special handling for verify command, doesn't require UserDiscordAccount
      const isVerifyCommand = command.data.name === 'verify';

      // Check if the user has linked their Discord account
      let linkedDiscordAccount: LinkedDiscordAccount | null = null;

      if (!isVerifyCommand) {
        try {
          linkedDiscordAccount = await checkLinkedAccountAndPermission(
            interaction.user.id,
          );
        } catch (accountError) {
          logger.error('Account verification failed', {
            userId: interaction.user.id,
            commandName: interaction.commandName,
            error:
              accountError instanceof Error
                ? accountError.message
                : String(accountError),
          });
          return interaction.reply({
            content: 'Unable to verify your account. Please try again later.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!linkedDiscordAccount) {
          return interaction.reply({
            content:
              'You need to link your Discord account before using this command.',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Team has to have Discord integration enabled
        if (
          linkedDiscordAccount.selectedTeam &&
          !linkedDiscordAccount.selectedTeam.discordIntegration?.active &&
          command.data.name !== 'choose-team'
        ) {
          return interaction.reply({
            content:
              'Your team does not have the Discord integration enabled. Please contact your team administrator.',
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      // Defer the reply to handle long-running commands
      await interaction.deferReply({
        flags: command.data.ephemeral ? MessageFlags.Ephemeral : undefined,
      });

      // Backup validation - should not happen due to earlier checks
      if (!isVerifyCommand && !linkedDiscordAccount) {
        logger.error('Linked account not found after verification', {
          userId: interaction.user.id,
          commandName: interaction.commandName,
        });
        return interaction.editReply({
          content:
            'An unexpected error occurred. Please try again later or contact support.',
        });
      }

      await command.execute(interaction, linkedDiscordAccount);
    } catch (error) {
      logger.error('Command execution failed', {
        commandName: interaction.commandName,
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: 'There was an error executing this command!',
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: 'There was an error executing this command!',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  } else if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);

    if (!command || !command.autocomplete) {
      logger.error('Autocomplete handler not found', {
        commandName: interaction.commandName,
        userId: interaction.user.id,
      });
      return;
    }

    try {
      // For autocomplete, we still check if the account is linked
      let linkedDiscordAccount: LinkedDiscordAccount | null = null;
      try {
        linkedDiscordAccount = await checkLinkedAccountAndPermission(
          interaction.user.id,
        );
      } catch (accountError) {
        logger.error('Account verification failed during autocomplete', {
          userId: interaction.user.id,
          commandName: interaction.commandName,
          error:
            accountError instanceof Error
              ? accountError.message
              : String(accountError),
        });
        return interaction.respond([]);
      }

      if (!linkedDiscordAccount) {
        // If not linked, return an empty response
        return interaction.respond([]);
      }

      // Team has to have Discord integration enabled
      if (
        linkedDiscordAccount.selectedTeam &&
        !linkedDiscordAccount.selectedTeam.discordIntegration?.active &&
        command.data.name !== 'choose-team'
      ) {
        return interaction.respond([]);
      }

      await command.autocomplete(interaction, linkedDiscordAccount);
    } catch (error) {
      logger.error('Autocomplete handling failed', {
        commandName: interaction.commandName,
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

async function updateBotStatus() {
  try {
    const licenseCount = await prisma.license.count();

    client.user?.setActivity({
      name: `${licenseCount} licenses`,
      type: ActivityType.Watching,
    });

    logger.info('Bot status updated', {
      activity: 'watching licenses',
      licenseCount,
    });
  } catch (error) {
    logger.error('Failed to update bot status', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function initializeDiscordSyncSubscriber() {
  try {
    await subscribeDiscordSync(async (message) => {
      logger.info('Received Discord sync notification', {
        discordId: message.discordId,
        teamId: message.teamId,
      });

      try {
        await syncUserById(message.discordId, message.teamId);
      } catch (error) {
        logger.error('Failed to sync Discord user roles', {
          discordId: message.discordId,
          teamId: message.teamId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    logger.info('Discord sync subscriber initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Discord sync subscriber', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

client.once(Events.ClientReady, () => {
  logger.info('Discord bot ready', {
    clientId: client.user?.id,
    guildCount: client.guilds.cache.size,
  });

  // Initialize the Discord client for services
  initializeDiscordClient(client);

  // Start the scheduled role sync task
  startScheduledRoleSync();

  registerCommands().catch((error) => {
    logger.error('Failed to register commands on startup', {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  updateBotStatus();

  // Initialize Discord sync subscriber
  initializeDiscordSyncSubscriber();

  // Update status every 30 minutes (1800000 ms)
  setInterval(
    () => {
      updateBotStatus();
    },
    30 * 60 * 1000,
  );
});

// Load events, commands and login
(async () => {
  try {
    await loadEvents();
    await loadCommands();
    await client.login(process.env.DISCORD_BOT_TOKEN);
  } catch (error) {
    logger.error('Bot initialization failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
})();
