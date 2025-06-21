import { WebhookEventType } from '@lukittu/shared';
import {
  createLicenseDiscordPayload,
  CreateLicenseWebhookPayload,
} from './payloads/create-license-payloads';

/**
 * Detects if the provided URL is a Discord webhook URL
 */
export function isDiscordWebhook(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname === 'discord.com' &&
      parsedUrl.pathname.startsWith('/api/webhooks/')
    );
  } catch {
    return false;
  }
}

/**
 * Formats a payload for Discord webhooks using embeds
 */
export function formatDiscordPayload(
  eventType: WebhookEventType,
  payload: any,
): any {
  switch (eventType) {
    case WebhookEventType.LICENSE_CREATED:
      return createLicenseDiscordPayload(
        payload as CreateLicenseWebhookPayload,
      );

    default:

    // Fallback for unsupported event types
  }
}
