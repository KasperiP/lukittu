import { randomUUID } from 'crypto';
import { logger } from '../logging/logger';
import { redisClient } from '../redis/redis';
import { CHANNELS, DiscordSyncMessage, MessageHandler } from './types';

export async function publishDiscordSync(
  data: Omit<DiscordSyncMessage, 'type'>,
): Promise<void> {
  const message: DiscordSyncMessage = {
    ...data,
    type: 'discord_sync',
  };

  try {
    await redisClient.publish(
      CHANNELS.DISCORD_SYNC,
      JSON.stringify({
        id: randomUUID(),
        data: message,
      }),
    );

    logger.info('Discord sync message published', {
      discordId: data.discordId,
    });
  } catch (error) {
    logger.error('Failed to publish Discord sync message', {
      discordId: data.discordId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function subscribeDiscordSync(
  handler: MessageHandler<DiscordSyncMessage>,
): Promise<void> {
  const subscriber = redisClient.duplicate();

  subscriber.on('message', async (channel: string, message: string) => {
    if (channel === CHANNELS.DISCORD_SYNC) {
      try {
        const parsed = JSON.parse(message);
        await handler(parsed.data);
      } catch (error) {
        logger.error('Failed to process Discord sync message', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  await subscriber.subscribe(CHANNELS.DISCORD_SYNC);
  logger.info('Subscribed to Discord sync channel');
}
