import {
  AuditLogSource,
  Team,
  User,
  WebhookEventType,
} from '../../prisma/generated/client';
import {
  createCustomerDiscordPayload,
  CreateCustomerWebhookPayload,
} from './payloads/create-customer-payloads';
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

export type PayloadType =
  | CreateLicenseWebhookPayload
  | CreateCustomerWebhookPayload;

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
        payload: payload as CreateLicenseWebhookPayload,
        team,
        user,
        source,
      });

    case WebhookEventType.CUSTOMER_CREATED:
      return createCustomerDiscordPayload({
        payload: payload as CreateCustomerWebhookPayload,
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
