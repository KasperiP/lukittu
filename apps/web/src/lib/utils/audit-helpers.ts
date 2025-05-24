import builtByBitLogo from '@/../public/integrations/builtbybit_square.png';
import discordLogo from '@/../public/integrations/discord_square.jpg';
import polymartLogo from '@/../public/integrations/polymart.png';
import stripeLogo from '@/../public/integrations/stripe_square.jpeg';
import { AuditLogSource } from '@lukittu/shared';
import { useTranslations } from 'next-intl';

type TFunction = ReturnType<typeof useTranslations<never>>;

export const getSourceDisplayName = (source: AuditLogSource, t: TFunction) => {
  switch (source) {
    case AuditLogSource.DASHBOARD:
      return t('general.user');
    case AuditLogSource.API_KEY:
      return 'API';
    case AuditLogSource.STRIPE_INTEGRATION:
      return 'Stripe';
    case AuditLogSource.DISCORD_INTEGRATION:
      return 'Discord';
    case AuditLogSource.BUILT_BY_BIT_INTEGRATION:
      return 'BuiltByBit';
    case AuditLogSource.POLYMART_INTEGRATION:
      return 'Polymart';
    default:
      return t('general.unknown');
  }
};

export const getSourceAvatarColor = (source: AuditLogSource) => {
  switch (source) {
    case AuditLogSource.DASHBOARD:
      return 'bg-primary';
    case AuditLogSource.API_KEY:
      return 'bg-amber-700';
    case AuditLogSource.STRIPE_INTEGRATION:
      return 'bg-[#635bff]';
    case AuditLogSource.DISCORD_INTEGRATION:
      return 'bg-[#5865f2]';
    case AuditLogSource.BUILT_BY_BIT_INTEGRATION:
      return 'bg-[#171c28]';
    case AuditLogSource.POLYMART_INTEGRATION:
      return 'bg-[#018687]';
    default:
      return 'bg-gray-500';
  }
};

export const getBrowserName = (browser: string | null) => {
  if (!browser) return null;
  if (browser?.includes('Chrome')) return 'Chrome';
  if (browser?.includes('Firefox')) return 'Firefox';
  if (browser?.includes('Safari')) return 'Safari';
  if (browser?.includes('Edge')) return 'Edge';
  if (browser?.includes('Opera')) return 'Opera';
  if (browser?.includes('Internet Explorer')) return 'Internet Explorer';
  if (browser?.includes('Brave')) return 'Brave';
  return browser
    ?.replace(/(\d+\.)+\d+/g, '')
    .replace(/\./g, ' ')
    .trim(); // Eg: "Lukittu Browser 1.0" becomes "Lukittu Browser"
};

export const getSourceBadgeVariant = (source: AuditLogSource) => {
  switch (source) {
    case AuditLogSource.DASHBOARD:
      return null;
    case AuditLogSource.API_KEY:
      return 'warning';
    case AuditLogSource.STRIPE_INTEGRATION:
    case AuditLogSource.DISCORD_INTEGRATION:
    case AuditLogSource.BUILT_BY_BIT_INTEGRATION:
    case AuditLogSource.POLYMART_INTEGRATION:
      return 'secondary';
    default:
      return 'outline';
  }
};

export const getIntegrationLogoSrc = (source: AuditLogSource) => {
  switch (source) {
    case AuditLogSource.STRIPE_INTEGRATION:
      return stripeLogo;
    case AuditLogSource.DISCORD_INTEGRATION:
      return discordLogo;
    case AuditLogSource.BUILT_BY_BIT_INTEGRATION:
      return builtByBitLogo;
    case AuditLogSource.POLYMART_INTEGRATION:
      return polymartLogo;
    default:
      return null;
  }
};
