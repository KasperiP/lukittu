import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type SetStripeIntegrationSchema = z.infer<
  ReturnType<typeof setStripeIntegrationSchema>
>;

export const setStripeIntegrationSchema = (t: I18nTranslator) =>
  z
    .object({
      active: z.boolean(),
      apiKey: z
        .string({
          required_error: t('validation.stripe_api_key_required'),
        })
        .min(1, {
          message: t('validation.stripe_api_key_invalid'),
        })
        .max(255, {
          message: t('validation.stripe_api_key_invalid'),
        })
        .regex(/^(sk_|rk_)/, {
          message: t('validation.stripe_api_key_invalid'),
        })
        .regex(/^[^\s]+$/, {
          message: t('validation.stripe_api_key_invalid'),
        }),
      webhookSecret: z
        .string({
          required_error: t('validation.stripe_webhook_secret_required'),
        })
        .min(1, {
          message: t('validation.stripe_webhook_secret_invalid'),
        })
        .max(255, {
          message: t('validation.stripe_webhook_secret_invalid'),
        })
        .regex(/^whsec_/, {
          message: t('validation.stripe_webhook_secret_invalid'),
        })
        .regex(/^[^\s]+$/, {
          message: t('validation.stripe_webhook_secret_invalid'),
        }),
    })
    .strict();
