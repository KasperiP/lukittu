import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type EnableTwoFactorSchema = z.infer<
  ReturnType<typeof enableTwoFactorSchema>
>;

export const enableTwoFactorSchema = (t: I18nTranslator) =>
  z
    .object({
      totpCode: z
        .string({
          required_error: t('validation.two_factor_code_required'),
        })
        .length(6, {
          message: t('validation.two_factor_code_length'),
        })
        .regex(/^\d{6}$/, {
          message: t('validation.two_factor_code_invalid'),
        }),
      password: z
        .string({
          required_error: t('validation.password_required'),
        })
        .min(6, {
          message: t('validation.password_min_length'),
        }),
    })
    .strict();
