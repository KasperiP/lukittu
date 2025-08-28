import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type SetPolymartIntegrationSchema = z.infer<
  ReturnType<typeof setPolymartIntegrationSchema>
>;

export const setPolymartIntegrationSchema = (t: I18nTranslator) =>
  z
    .object({
      active: z.boolean(),
      webhookSecret: z
        .string({
          required_error: t('validation.polymart_webhook_secret_required'),
        })
        .min(20, {
          message: t('validation.polymart_webhook_secret_invalid', {
            min: '20',
            max: '255',
          }),
        })
        .max(255, {
          message: t('validation.polymart_webhook_secret_invalid', {
            min: '20',
            max: '255',
          }),
        }),
      signingSecret: z
        .string({
          required_error: t('validation.polymart_signing_secret_required'),
        })
        .min(20, {
          message: t('validation.polymart_signing_secret_invalid', {
            min: '20',
            max: '255',
          }),
        })
        .max(255, {
          message: t('validation.polymart_signing_secret_invalid', {
            min: '20',
            max: '255',
          }),
        }),
    })
    .strict();
