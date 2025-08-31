import { I18nTranslator } from '@/types/i18n-types';
import { regex } from '@lukittu/shared';
import { z } from 'zod';

export type SetBuiltByBitIntegrationSchema = z.infer<
  ReturnType<typeof setBuiltByBitIntegrationSchema>
>;

export const setBuiltByBitIntegrationSchema = (t: I18nTranslator) =>
  z
    .object({
      active: z.boolean(),
      apiSecret: z
        .string({
          required_error: t('validation.built_by_bit_secret_required'),
        })
        .regex(regex.builtByBitApiSecret, {
          message: t('validation.built_by_bit_secret_invalid'),
        }),
    })
    .strict();
