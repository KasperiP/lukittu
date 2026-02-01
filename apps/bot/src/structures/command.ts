import {
  DiscordIntegration,
  Limits,
  Team,
  User,
  UserDiscordAccount,
} from '@lukittu/shared';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

export type LinkedDiscordAccount = Omit<UserDiscordAccount, 'refreshToken'> & {
  user: Omit<User, 'passwordHash'> & {
    teams: (Team & {
      discordIntegration: DiscordIntegration | null;
    })[];
  };
  selectedTeam:
    | (Team & {
        limits: Limits | null;
        discordIntegration: DiscordIntegration | null;
      })
    | null;
};

export interface Command {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody & {
    ephemeral?: boolean;
  };
  autocomplete?: (
    interaction: AutocompleteInteraction,
    discordAccount: LinkedDiscordAccount,
  ) => Promise<void>;
  execute: (
    interaction: ChatInputCommandInteraction,
    discordAccount: LinkedDiscordAccount | null,
  ) => Promise<void>;
}

export function Command(options: Command): Command {
  return options;
}
