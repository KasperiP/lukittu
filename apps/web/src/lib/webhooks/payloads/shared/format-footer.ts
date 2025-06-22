import builtByBitSquare from '@/../public/integrations/builtbybit_square.png';
import discordSquare from '@/../public/integrations/discord_square.jpg';
import lukittuBot from '@/../public/integrations/lukittu_bot_square.png';
import polymartSquare from '@/../public/integrations/polymart.png';
import stripeSquare from '@/../public/integrations/stripe_square.jpeg';
import { AuditLogSource } from '@lukittu/shared';
import { User } from '@sentry/nextjs';

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
      return stripeSquare.src;
    case AuditLogSource.DISCORD_INTEGRATION:
      return discordSquare.src;
    case AuditLogSource.BUILT_BY_BIT_INTEGRATION:
      return builtByBitSquare.src;
    case AuditLogSource.POLYMART_INTEGRATION:
      return polymartSquare.src;
    case AuditLogSource.API_KEY:
      return lukittuBot.src;
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
