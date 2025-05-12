import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type SetPolymartIntegrationSchema = z.infer<
  ReturnType<typeof setPolymartIntegrationSchema>
>;

export const setPolymartIntegrationSchema = (t: I18nTranslator) =>
  z
    .object({
      active: z.boolean(),
      apiSecret: z
        .string({
          required_error: t('validation.polymart_secret_required'),
        })
        .length(48, {
          message: t('validation.polymart_secret_invalid'),
        }),
    })
    .strict();
