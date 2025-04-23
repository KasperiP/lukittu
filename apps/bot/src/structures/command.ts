import {
  DiscordAccount,
  DiscordIntegration,
  Limits,
  Team,
  User,
} from '@lukittu/shared';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

export type LinkedDiscordAccount = DiscordAccount & {
  user: Omit<User, 'passwordHash'> & {
    teams: Team[];
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
    discordAccount: LinkedDiscordAccount,
  ) => Promise<void>;
}

export function Command(options: Command): Command {
  return options;
}
