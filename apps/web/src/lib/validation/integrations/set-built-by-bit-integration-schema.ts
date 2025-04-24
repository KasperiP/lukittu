import { I18nTranslator } from '@/types/i18n-types';
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
        .regex(/^bbb_[A-Za-z0-9]{64}$/, {
          message: t('validation.built_by_bit_secret_invalid'),
        }),
    })
    .strict();
