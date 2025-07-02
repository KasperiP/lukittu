import {
  AuditLogSource,
  Team,
  User,
  WebhookEventType,
} from '../../prisma/generated/client';
import {
  createLicenseDiscordPayload,
  CreateLicenseWebhookPayload,
} from './payloads/create-license-payloads';

export interface WebhookDiscordPayload<T> {
  source: AuditLogSource;
  payload: T;
  team: Team;
  user: Omit<User, 'passwordHash'> | null;
}

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

export type PayloadType = CreateLicenseWebhookPayload;

interface FormatDiscordPayloadParams {
  eventType: WebhookEventType;
  source: AuditLogSource;
  payload: PayloadType;
  team: Team;
  user: Omit<User, 'passwordHash'> | null;
}

export function formatDiscordPayload({
  eventType,
  payload,
  team,
  source,
  user,
}: FormatDiscordPayloadParams) {
  switch (eventType) {
    case WebhookEventType.LICENSE_CREATED:
      return createLicenseDiscordPayload({
        payload,
        team,
        user,
        source,
      });

    default:
      throw new Error(
        `Unsupported event type for Discord webhook: ${eventType}`,
      );
  }
}
