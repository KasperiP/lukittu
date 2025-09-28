import { logger } from '@lukittu/shared';
import { Client } from 'discord.js';

let discordClient: Client | null = null;

/**
 * Initialize the Discord client for use across services
 */
export function initializeDiscordClient(client: Client): void {
  discordClient = client;
  logger.info('Discord client initialized', {
    clientId: client.user?.id,
  });
}

/**
 * Get the Discord client instance
 * @throws Error if client is not initialized
 */
export function getDiscordClient(): Client {
  if (!discordClient) {
    throw new Error(
      'Discord client not initialized. Call initializeDiscordClient() first.',
    );
  }
  return discordClient;
}

/**
 * Check if the Discord client is ready for use
 */
export function isClientReady(): boolean {
  return discordClient !== null && discordClient.isReady();
}
