import { AuditLogSource, Team, User, WebhookEventType } from '@lukittu/shared';
import { createLicenseDiscordPayload } from './payloads/create-license-payloads';

export type WebhookDiscordPayload<T> = {
  source: AuditLogSource;
  payload: T;
  team: Team;
  user: Omit<User, 'passwordHash'> | null;
};

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

interface FormatDiscordPayloadParams {
  eventType: WebhookEventType;
  source: AuditLogSource;
  payload: any;
  team: Team;
  user: Omit<User, 'passwordHash'> | null;
}

export function formatDiscordPayload({
  eventType,
  payload,
  team,
  source,
  user,
}: FormatDiscordPayloadParams): any {
  switch (eventType) {
    case WebhookEventType.LICENSE_CREATED:
      return createLicenseDiscordPayload({
        payload,
        team,
        user,
        source,
      });

    default:

    // Fallback for unsupported event types
  }
}
