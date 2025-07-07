import {
  AuditLogSource,
  Team,
  User,
  WebhookEventType,
} from '../../prisma/generated/client';
import {
  createCustomerDiscordPayload,
  CreateCustomerWebhookPayload,
  deleteCustomerDiscordPayload,
  DeleteCustomerWebhookPayload,
  updateCustomerDiscordPayload,
  UpdateCustomerWebhookPayload,
} from './payloads/customer-webhook-payload';
import {
  createLicenseDiscordPayload,
  CreateLicenseWebhookPayload,
  deleteLicenseDiscordPayload,
  DeleteLicenseWebhookPayload,
  updateLicenseDiscordPayload,
  UpdateLicenseWebhookPayload,
} from './payloads/license-webhook-payload';
import {
  createProductDiscordPayload,
  CreateProductWebhookPayload,
  deleteProductDiscordPayload,
  DeleteProductWebhookPayload,
  updateProductDiscordPayload,
  UpdateProductWebhookPayload,
} from './payloads/product-webhook-payload';
import {
  createReleaseDiscordPayload,
  CreateReleaseWebhookPayload,
  deleteReleaseDiscordPayload,
  DeleteReleaseWebhookPayload,
  updateReleaseDiscordPayload,
  UpdateReleaseWebhookPayload,
} from './payloads/release-webhook-payload';

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
  | UpdateLicenseWebhookPayload
  | DeleteLicenseWebhookPayload
  | CreateCustomerWebhookPayload
  | UpdateCustomerWebhookPayload
  | DeleteCustomerWebhookPayload
  | CreateProductWebhookPayload
  | UpdateProductWebhookPayload
  | DeleteProductWebhookPayload
  | CreateReleaseWebhookPayload
  | UpdateReleaseWebhookPayload
  | DeleteReleaseWebhookPayload;

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

    case WebhookEventType.LICENSE_UPDATED:
      return updateLicenseDiscordPayload({
        payload: payload as UpdateLicenseWebhookPayload,
        team,
        user,
        source,
      });

    case WebhookEventType.LICENSE_DELETED:
      return deleteLicenseDiscordPayload({
        payload: payload as DeleteLicenseWebhookPayload,
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

    case WebhookEventType.CUSTOMER_UPDATED:
      return updateCustomerDiscordPayload({
        payload: payload as UpdateCustomerWebhookPayload,
        team,
        user,
        source,
      });

    case WebhookEventType.CUSTOMER_DELETED:
      return deleteCustomerDiscordPayload({
        payload: payload as DeleteCustomerWebhookPayload,
        team,
        user,
        source,
      });

    case WebhookEventType.PRODUCT_CREATED:
      return createProductDiscordPayload({
        payload: payload as CreateProductWebhookPayload,
        team,
        user,
        source,
      });

    case WebhookEventType.PRODUCT_UPDATED:
      return updateProductDiscordPayload({
        payload: payload as UpdateProductWebhookPayload,
        team,
        user,
        source,
      });

    case WebhookEventType.PRODUCT_DELETED:
      return deleteProductDiscordPayload({
        payload: payload as DeleteProductWebhookPayload,
        team,
        user,
        source,
      });

    case WebhookEventType.RELEASE_CREATED:
      return createReleaseDiscordPayload({
        payload: payload as CreateReleaseWebhookPayload,
        team,
        user,
        source,
      });

    case WebhookEventType.RELEASE_UPDATED:
      return updateReleaseDiscordPayload({
        payload: payload as UpdateReleaseWebhookPayload,
        team,
        user,
        source,
      });

    case WebhookEventType.RELEASE_DELETED:
      return deleteReleaseDiscordPayload({
        payload: payload as DeleteReleaseWebhookPayload,
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
