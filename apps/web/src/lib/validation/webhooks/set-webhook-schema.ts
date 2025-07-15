import { I18nTranslator } from '@/types/i18n-types';
import { WebhookEventType } from '@lukittu/shared';
import { z } from 'zod';

export type SetWebhookSchema = z.infer<ReturnType<typeof setWebhookSchema>>;

const validateWebhookUrlProduction = (url: string, t: I18nTranslator) => {
  // Only apply strict validation in production
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  try {
    const parsedUrl = new URL(url);

    // Only allow HTTPS in production
    if (parsedUrl.protocol !== 'https:') {
      return t('validation.webhook_url_invalid');
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // Block localhost and loopback
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1'
    ) {
      return t('validation.webhook_url_invalid');
    }

    // Block private IP ranges (RFC 1918) to prevent SSRF
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipv4Match = hostname.match(ipv4Regex);

    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);

      // Block private and reserved IP ranges
      if (
        a === 10 || // 10.0.0.0/8
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
        (a === 192 && b === 168) || // 192.168.0.0/16
        (a === 169 && b === 254) || // 169.254.0.0/16 (link-local)
        a === 0 || // 0.0.0.0/8
        a >= 224 // Multicast and reserved ranges
      ) {
        return t('validation.webhook_url_invalid');
      }
    }

    // Block common internal/development domains
    const blockedDomains = ['internal', 'local', 'lan', 'localhost'];
    if (blockedDomains.some((domain) => hostname.includes(domain))) {
      return t('validation.webhook_url_invalid');
    }

    return true;
  } catch {
    return t('validation.webhook_url_invalid');
  }
};

export const setWebhookSchema = (t: I18nTranslator) =>
  z
    .object({
      name: z
        .string({
          required_error: t('validation.webhook_name_required'),
        })
        .min(3, {
          message: t('validation.webhook_name_min_length'),
        })
        .max(255, {
          message: t('validation.webhook_name_max_length'),
        }),
      url: z
        .string({
          required_error: t('validation.webhook_url_invalid'),
        })
        .url({
          message: t('validation.webhook_url_invalid'),
        })
        .refine(
          (url) => validateWebhookUrlProduction(url, t) === true,
          (url) => ({
            message: validateWebhookUrlProduction(url, t) as string,
          }),
        ),
      active: z.boolean(),
      enabledEvents: z.array(z.nativeEnum(WebhookEventType)),
    })
    .strict();
