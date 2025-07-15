import { AuditLogSource, User } from '../../../../prisma/generated/client';

const getSourceDisplayName = (source: AuditLogSource): string => {
  switch (source) {
    case AuditLogSource.DASHBOARD:
      return 'Dashboard';
    case AuditLogSource.API_KEY:
      return 'API Key';
    case AuditLogSource.STRIPE_INTEGRATION:
      return 'Stripe';
    case AuditLogSource.DISCORD_INTEGRATION:
      return 'Discord';
    case AuditLogSource.BUILT_BY_BIT_INTEGRATION:
      return 'BuiltByBit';
    case AuditLogSource.POLYMART_INTEGRATION:
      return 'Polymart';
    default:
      return 'Unknown';
  }
};

const getIntegrationLogoUrl = (source: AuditLogSource): string | null => {
  switch (source) {
    case AuditLogSource.STRIPE_INTEGRATION:
      return `${process.env.BASE_URL}/integrations/stripe_square.jpeg`;
    case AuditLogSource.DISCORD_INTEGRATION:
      return `${process.env.BASE_URL}/integrations/discord_square.jpg`;
    case AuditLogSource.BUILT_BY_BIT_INTEGRATION:
      return `${process.env.BASE_URL}/integrations/builtbybit_square.png`;
    case AuditLogSource.POLYMART_INTEGRATION:
      return `${process.env.BASE_URL}/integrations/polymart.png`;
    case AuditLogSource.API_KEY:
      return `${process.env.BASE_URL}/integrations/lukittu_bot_square.png`;
    default:
      return null;
  }
};

export interface FormatFooterParams {
  source: AuditLogSource;
  user?: Omit<User, 'passwordHash'> | null;
}

export const formatDiscordFooter = ({ source, user }: FormatFooterParams) => {
  const isUserAction = source === AuditLogSource.DASHBOARD;
  const integrationLogoUrl = getIntegrationLogoUrl(source);
  const sourceDisplayName = getSourceDisplayName(source);

  return {
    text: isUserAction
      ? user
        ? `${user.email}`
        : 'Unknown User'
      : `${sourceDisplayName}`,
    icon_url: isUserAction
      ? user?.imageUrl || undefined
      : integrationLogoUrl || undefined,
  };
};
