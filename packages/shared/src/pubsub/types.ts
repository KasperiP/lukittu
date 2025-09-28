export interface DiscordSyncMessage {
  type: 'discord_sync';
  discordId: string;
  teamId: string;
}

export type MessageHandler<T = any> = (message: T) => Promise<void>;

export const CHANNELS = {
  DISCORD_SYNC: 'discord:sync',
} as const;
