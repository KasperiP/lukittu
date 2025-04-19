import { REST } from '@discordjs/rest';
import {
  DiscordAccount,
  Limits,
  logger,
  prisma,
  Team,
  User,
} from '@lukittu/shared';
import {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Routes,
} from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { Command } from './structures/command';

export type LinkedDiscordAccount = DiscordAccount & {
  user: Omit<User, 'passwordHash'> & {
    teams: Team[];
  };
  selectedTeam:
    | (Team & {
        limits: Limits | null;
      })
    | null;
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection<string, Command>();
const commands: Command[] = [];

// Function to load all commands
async function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const commandFiles = fs
      .readdirSync(folderPath)
      .filter((file) => file.endsWith('.ts'));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const command = (await import(filePath)).default;

      // Set a new item in the Collection with the key as the command name and the value as the command module
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commands.push(command.data);
      } else {
        logger.info(
          `The command at ${filePath} is missing a required "data" or "execute" property.`,
        );
      }
    }
  }
}

// Register slash commands with Discord
async function registerCommands() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!clientId) {
    logger.error('Missing DISCORD_CLIENT_ID in environment variables');
    return;
  }

  if (!token) {
    logger.error('Missing DISCORD_BOT_TOKEN in environment variables');
    return;
  }

  const rest = new REST().setToken(token);

  try {
    logger.info(
      `Started refreshing ${commands.length} application (/) commands.`,
    );

    // The route depends on whether you want to register commands globally or for a specific guild
    await rest.put(Routes.applicationCommands(clientId), { body: commands });

    logger.info(`Successfully reloaded application (/) commands.`);
  } catch (error) {
    logger.error(error);
  }
}

// Handle interactions
client.on(Events.InteractionCreate, async (interaction) => {
  // Check if the user has a linked Discord account
  const checkLinkedAccountAndPermission = async (
    userId: string,
  ): Promise<LinkedDiscordAccount | null> => {
    try {
      const discordAccount = await prisma.discordAccount.findUnique({
        where: { discordId: userId },
        include: {
          selectedTeam: {
            where: {
              deletedAt: null,
            },
            include: {
              limits: true,
            },
          },
          user: {
            include: {
              teams: {
                where: {
                  deletedAt: null,
                },
              },
            },
          },
        },
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
            await prisma.discordAccount.update({
              where: { id: discordAccount.id },
              data: { selectedTeamId: null },
            });
          }
        }
      }

      return discordAccount;
    } catch (error) {
      logger.error(`Error checking linked account for user ${userId}:`, error);
      throw new Error(
        'Failed to verify linked account due to a database error',
      );
    }
  };

  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      // Check if the user has linked their Discord account
      let linkedDiscordAccount: LinkedDiscordAccount | null = null;
      try {
        linkedDiscordAccount = await checkLinkedAccountAndPermission(
          interaction.user.id,
        );

        if (!linkedDiscordAccount) {
          return interaction.reply({
            content:
              'You need to link your Discord account before using this command.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (accountError) {
        logger.error('Account verification error:', accountError);
        return interaction.reply({
          content: 'Unable to verify your account. Please try again later.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Defer the reply to handle long-running commands
      await interaction.deferReply({
        flags: command.data.ephemeral ? MessageFlags.Ephemeral : undefined,
      });

      await command.execute(interaction, linkedDiscordAccount);
    } catch (error) {
      logger.error(`Error executing ${interaction.commandName}`);
      logger.error(error);
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
      logger.error(
        `No autocomplete handler for ${interaction.commandName} was found.`,
      );
      return;
    }

    try {
      // For autocomplete, we still check if the account is linked
      let linkedDiscordAccount: LinkedDiscordAccount | null = null;
      try {
        linkedDiscordAccount = await checkLinkedAccountAndPermission(
          interaction.user.id,
        );

        if (!linkedDiscordAccount) {
          // If not linked, return an empty response
          return interaction.respond([]);
        }
      } catch (accountError) {
        logger.error(
          'Account verification error during autocomplete:',
          accountError,
        );
        return interaction.respond([]);
      }

      await command.autocomplete(interaction, linkedDiscordAccount);
    } catch (error) {
      logger.error(
        `Error handling autocomplete for ${interaction.commandName}`,
      );
      logger.error(error);
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

    logger.info(`Updated status: Watching ${licenseCount} licenses`);
  } catch (error) {
    logger.error('Failed to update bot status:', error);
  }
}

client.once(Events.ClientReady, () => {
  logger.info('Ready!');
  registerCommands().catch(logger.error);

  updateBotStatus();

  // Update status every 30 minutes (1800000 ms)
  setInterval(
    () => {
      updateBotStatus();
    },
    30 * 60 * 1000,
  );
});

// Load commands and login
(async () => {
  try {
    await loadCommands();
    await client.login(process.env.DISCORD_BOT_TOKEN);
  } catch (error) {
    logger.error('Failed to initialize:', error);
  }
})();
