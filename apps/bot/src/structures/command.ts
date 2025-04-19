import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { LinkedDiscordAccount } from '..';

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

export const Command = (options: Command): Command => options;
