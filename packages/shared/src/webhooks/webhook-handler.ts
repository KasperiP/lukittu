import crypto from 'crypto';
import {
  AuditLogSource,
  Prisma,
  Team,
  User,
  Webhook,
  WebhookEvent,
  WebhookEventStatus,
  WebhookEventType,
} from '../../prisma/generated/client';
import { logger } from '../logging/logger';
import { prisma } from '../prisma/prisma';
import { PrismaTransaction } from '../types/prisma-types';
import {
  formatDiscordPayload,
  isDiscordWebhook,
  PayloadType,
} from './discord-webhooks';

interface CreateWebhookEventParams {
  eventType: WebhookEventType;
  teamId: string;
  source: AuditLogSource;
  userId?: string;
  payload: PayloadType;
  tx: PrismaTransaction;
}

/**
 * Creates webhook events in the database (without sending) as part of a transaction
 * This should be called within a Prisma transaction
 */
export async function createWebhookEvents({
  eventType,
  teamId,
  userId,
  source,
  payload,
  tx,
}: CreateWebhookEventParams) {
  try {
    logger.info('Creating webhook events in transaction', {
      eventType,
      teamId,
    });

    // Find active webhooks for the team that have this event type enabled
    const webhooks = await tx.webhook.findMany({
      where: {
        teamId,
        active: true,
        enabledEvents: {
          has: eventType,
        },
      },
    });

    if (webhooks.length === 0) {
      logger.info('No active webhooks found for event', {
        eventType,
        teamId,
      });
      return [];
    }

    logger.info('Found webhooks to create events for', {
      eventType,
      teamId,
      webhookCount: webhooks.length,
    });

    // Create webhook events (but don't attempt delivery yet)
    const webhookEventIds = [];

    for (const webhook of webhooks) {
      // Create the webhook event record
      const webhookEvent = await tx.webhookEvent.create({
        data: {
          webhookId: webhook.id,
          eventType,
          payload,
          source,
          userId: userId || null,
          status: WebhookEventStatus.PENDING,
        },
      });

      webhookEventIds.push(webhookEvent.id);

      logger.info('Created webhook event in transaction', {
        eventId: webhookEvent.id,
        webhookId: webhook.id,
        eventType,
        teamId,
      });
    }

    return webhookEventIds;
  } catch (error) {
    logger.error('Error creating webhook events in transaction', {
      eventType,
      teamId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Re-throw so transaction can be rolled back
    throw error;
  }
}

/**
 * Attempts to deliver pending webhook events that were created previously
 * This should be called outside of a transaction after it has been committed
 */
export async function attemptWebhookDelivery(webhookEventIds: string[]) {
  try {
    if (!webhookEventIds.length) return;

    logger.info('Attempting delivery of webhook events', {
      count: webhookEventIds.length,
      webhookEventIds,
    });

    // Process each event as a separate promise to avoid one failure affecting others
    await Promise.allSettled(
      webhookEventIds.map(async (eventId) => {
        try {
          await sendWebhookEvent(eventId);
        } catch (error) {
          // Log but don't rethrow - the retry mechanism will handle failures
          logger.error('Failed initial webhook delivery attempt', {
            webhookEventId: eventId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  } catch (error) {
    logger.error('Failed to process webhook deliveries', {
      webhookEventIds,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

/**
 * Sends a webhook event to its destination
 */
async function sendWebhookEvent(webhookEventId: string): Promise<boolean> {
  logger.info('Sending webhook event', { webhookEventId });

  return await prisma.$transaction(
    async (prisma) => {
      // Lock the webhook event row to prevent concurrent processing
      const lockResult = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "WebhookEvent" WHERE id = ${webhookEventId} FOR UPDATE
      `;

      if (lockResult.length === 0) {
        logger.info('Webhook event not found for locking', { webhookEventId });
        return false;
      }

      let webhookEvent: WebhookEvent & {
        webhook: Webhook & {
          team: Team;
        };
        user: User | null;
      };
      try {
        webhookEvent = await prisma.webhookEvent.update({
          where: {
            id: webhookEventId,
            status: {
              in: [
                WebhookEventStatus.PENDING,
                WebhookEventStatus.RETRY_SCHEDULED,
              ],
            },
          },
          data: {
            status: WebhookEventStatus.IN_PROGRESS,
            attempts: {
              increment: 1,
            },
            lastAttemptAt: new Date(),
          },
          include: {
            webhook: {
              include: {
                team: true,
              },
            },
            user: true,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          logger.info('Webhook event not found or already being processed', {
            webhookEventId,
          });
          return false;
        }
        // Re-throw other errors
        throw error;
      }

      const team = webhookEvent.webhook.team;
      const user = webhookEvent.user;

      logger.info('Processing webhook event', {
        webhookEventId,
        webhookId: webhookEvent.webhookId,
        eventType: webhookEvent.eventType,
        attempt: webhookEvent.attempts,
        url: webhookEvent.webhook.url,
      });

      // Validate webhook URL before attempting to send
      let url: URL;
      const isProd = process.env.NODE_ENV === 'production';
      try {
        url = new URL(webhookEvent.webhook.url);

        if (isProd) {
          if (url.protocol !== 'https:') {
            throw new Error('Only HTTPS URLs are allowed in production');
          }
        } else {
          // In development, allow HTTP but warn
          if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw new Error(`Unsupported URL protocol: ${url.protocol}`);
          }
        }
      } catch (error) {
        logger.error('Invalid webhook URL', {
          webhookEventId,
          url: webhookEvent.webhook.url,
          error: error instanceof Error ? error.message : String(error),
        });

        await markWebhookAsFailed(
          prisma,
          webhookEvent.id,
          'Invalid webhook URL',
        );
        return false;
      }

      try {
        // Determine if this is a Discord webhook and format payload accordingly
        const isDiscord = isDiscordWebhook(webhookEvent.webhook.url);
        let requestBody: string;

        if (isDiscord) {
          const discordPayload = formatDiscordPayload({
            eventType: webhookEvent.eventType,
            payload: webhookEvent.payload as unknown as PayloadType,
            team,
            source: webhookEvent.source,
            user,
          });
          requestBody = JSON.stringify(discordPayload);
          logger.info('Using Discord webhook format', { webhookEventId });
        } else {
          requestBody = JSON.stringify(webhookEvent.payload);
        }

        // Calculate signature for webhook verification (except for Discord)
        const timestamp = Date.now();
        const signature = !isDiscord
          ? generateSignature(
              webhookEvent.webhook.secret,
              timestamp.toString(),
              requestBody,
            )
          : 'discord-webhook-no-signature'; // Discord doesn't need our signature

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        logger.info('Sending webhook request', {
          webhookEventId,
          url: webhookEvent.webhook.url,
          eventType: webhookEvent.eventType,
          isDiscordFormat: isDiscord,
        });

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'Lukittu-Webhook/1.0',
        };

        // Only add signature headers for non-Discord webhooks
        if (!isDiscord) {
          headers['X-Lukittu-Signature'] = signature;
          headers['X-Lukittu-Timestamp'] = timestamp.toString();
          headers['X-Lukittu-Event'] = webhookEvent.eventType;
        }

        const response = await fetch(webhookEvent.webhook.url, {
          method: 'POST',
          headers,
          body: requestBody,
          signal: controller.signal,
        }).finally(() => {
          clearTimeout(timeoutId);
        });

        // Mark as delivered if successful
        if (response.ok) {
          let responseText: string;
          try {
            responseText = await response.text();
          } catch (error) {
            logger.error('Failed to read response body', {
              webhookEventId,
              error: error instanceof Error ? error.message : String(error),
            });
            responseText = '(Failed to read response body)';
          }

          logger.info('Webhook delivered successfully', {
            webhookEventId,
            statusCode: response.status,
            webhookId: webhookEvent.webhookId,
            eventType: webhookEvent.eventType,
          });

          await prisma.webhookEvent.update({
            where: {
              id: webhookEvent.id,
            },
            data: {
              status: WebhookEventStatus.DELIVERED,
              responseCode: response.status,
              responseBody: responseText.substring(0, 1000), // Limit response size
              completedAt: new Date(),
              errorMessage: null,
              nextRetryAt: null,
            },
          });

          return true;
        } else {
          // Handle non-2xx response
          let responseText: string;
          try {
            responseText = await response.text();
          } catch (error) {
            logger.error('Failed to read error response body', {
              webhookEventId,
              error: error instanceof Error ? error.message : String(error),
            });
            responseText = '(Failed to read error response)';
          }

          throw new Error(
            `Webhook responded with status code: ${response.status}, body: ${responseText.substring(0, 200)}`,
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        logger.info('Webhook delivery failed', {
          webhookEventId,
          webhookId: webhookEvent.webhookId,
          attempt: webhookEvent.attempts,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        });

        // Calculate next retry time using exponential backoff
        const maxRetries = 5;

        if (webhookEvent.attempts >= maxRetries) {
          logger.error('Webhook max retries reached, marking as failed', {
            webhookEventId,
            webhookId: webhookEvent.webhookId,
            attempts: webhookEvent.attempts,
            maxRetries,
          });

          await markWebhookAsFailed(prisma, webhookEvent.id, errorMessage);
          return false;
        }

        const retryDelay = calculateRetryDelay(webhookEvent.attempts);
        const nextRetryAt = new Date(Date.now() + retryDelay * 1000);

        logger.info('Scheduling webhook retry', {
          webhookEventId,
          webhookId: webhookEvent.webhookId,
          attempt: webhookEvent.attempts,
          nextRetryAt: nextRetryAt.toISOString(),
          retryDelaySeconds: retryDelay,
        });

        await prisma.webhookEvent.update({
          where: {
            id: webhookEvent.id,
          },
          data: {
            status: WebhookEventStatus.RETRY_SCHEDULED,
            errorMessage: errorMessage.substring(0, 255),
            nextRetryAt,
          },
        });

        return false;
      }
    },
    {
      maxWait: 15000,
      timeout: 30000,
      isolationLevel: 'Serializable',
    },
  );
}

/**
 * Helper function to mark a webhook event as failed
 * Only deactivates the webhook if it has multiple consecutive failed events
 */
async function markWebhookAsFailed(
  tx: Prisma.TransactionClient,
  webhookEventId: string,
  errorMessage: string,
): Promise<void> {
  let webhookId: string;
  try {
    const webhookEvent = await tx.webhookEvent.update({
      where: { id: webhookEventId },
      data: {
        status: WebhookEventStatus.FAILED,
        errorMessage: errorMessage.substring(0, 255),
        nextRetryAt: null,
      },
      select: { webhookId: true },
    });
    webhookId = webhookEvent.webhookId;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      logger.info('Webhook event not found, cannot mark as failed', {
        webhookEventId,
      });
      return; // The event doesn't exist, so we can't proceed.
    }
    // Re-throw other errors to ensure transaction rollback
    throw error;
  }

  // Count recent failures for this webhook (last 48 hours)
  const recentFailureCount = await tx.webhookEvent.count({
    where: {
      webhookId: webhookId,
      status: WebhookEventStatus.FAILED,
      updatedAt: {
        gte: new Date(Date.now() - 48 * 60 * 60 * 1000), // Last 48 hours
      },
    },
  });

  // Check if there's been any successful delivery in the last 48 hours
  const recentSuccessCount = await tx.webhookEvent.count({
    where: {
      webhookId: webhookId,
      status: WebhookEventStatus.DELIVERED,
      updatedAt: {
        gte: new Date(Date.now() - 48 * 60 * 60 * 1000), // Last 48 hours
      },
    },
  });

  const failureThreshold = 3; // Only deactivate after 3+ failures

  if (recentFailureCount >= failureThreshold && recentSuccessCount === 0) {
    logger.info('Deactivating webhook due to multiple consecutive failures', {
      webhookId: webhookId,
      recentFailureCount,
      failureThreshold,
    });

    await tx.webhook.update({
      where: { id: webhookId },
      data: { active: false },
    });
  } else {
    logger.info('Webhook failure recorded but not deactivating', {
      webhookId: webhookId,
      recentFailureCount,
      recentSuccessCount,
      failureThreshold,
    });
  }
}

/**
 * Process webhook events that are ready for retry
 */
export async function processWebhookRetries(): Promise<number> {
  logger.info('Processing webhook retries');
  let processedCount = 0;

  try {
    // Find events that are scheduled for retry and are due, plus stuck PENDING events
    const eventsToRetry = await prisma.webhookEvent
      .findMany({
        where: {
          OR: [
            {
              status: WebhookEventStatus.RETRY_SCHEDULED,
              nextRetryAt: {
                lte: new Date(),
              },
            },
            {
              // Include PENDING events that are stuck (older than 5 minutes with 0 attempts)
              status: WebhookEventStatus.PENDING,
              attempts: 0,
              createdAt: {
                lte: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
              },
            },
          ],
        },
        take: 50, // Process in batches
        orderBy: [
          {
            nextRetryAt: 'asc', // Process scheduled retries first
          },
          {
            createdAt: 'asc', // Then oldest stuck events
          },
        ],
      })
      .catch((error) => {
        logger.error('Failed to fetch webhook events for retry', {
          error: error.message,
        });
        return [];
      });

    if (eventsToRetry.length === 0) {
      logger.info('No webhook events pending retry');
      return 0;
    }

    logger.info(`Found ${eventsToRetry.length} webhook events to retry`);

    // Process events in parallel but with a concurrency limit
    const concurrencyLimit = 5; // Process 5 at a time
    const batchResults = [];

    for (let i = 0; i < eventsToRetry.length; i += concurrencyLimit) {
      const batch = eventsToRetry.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map((event) =>
        sendWebhookEvent(event.id)
          .then((success) => ({ id: event.id, success }))
          .catch((error) => {
            logger.error('Error processing webhook retry', {
              webhookEventId: event.id,
              error: error instanceof Error ? error.message : String(error),
            });
            return { id: event.id, success: false };
          }),
      );

      const results = await Promise.all(batchPromises);
      batchResults.push(...results);
      processedCount += results.filter((r) => r.success).length;

      // Small delay between batches to avoid overwhelming external systems
      if (i + concurrencyLimit < eventsToRetry.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info(`Completed processing ${processedCount} webhook retries`, {
      succeeded: processedCount,
      failed: eventsToRetry.length - processedCount,
    });

    return processedCount;
  } catch (error) {
    logger.error('Critical error processing webhook retries', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return processedCount;
  }
}

/**
 * Calculate retry delay using exponential backoff
 * Retry delays: 60s, 120s, 240s, 480s, 960s, etc.
 */
function calculateRetryDelay(attempts: number): number {
  const baseDelay = 60; // 60 seconds
  return Math.min(
    baseDelay * Math.pow(2, attempts - 1),
    24 * 60 * 60, // Max 24 hours
  );
}

/**
 * Generate a signature to allow webhook receivers to verify the request
 */
function generateSignature(
  secret: string,
  timestamp: string,
  body: string,
): string {
  const signatureData = `${timestamp}.${body}`;
  return crypto
    .createHmac('sha256', secret)
    .update(signatureData)
    .digest('hex');
}
