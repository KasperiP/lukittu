import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type DisableTwoFactorSchema = z.infer<
  ReturnType<typeof disableTwoFactorSchema>
>;

export const disableTwoFactorSchema = (t: I18nTranslator) =>
  z
    .object({
      password: z
        .string({
          required_error: t('validation.password_required'),
        })
        .min(6, {
          message: t('validation.password_min_length'),
        }),
      totpCode: z
        .string({
          required_error: t('validation.two_factor_code_required'),
        })
        .min(6, {
          message: t('validation.two_factor_code_min_length'),
        })
        .max(8, {
          message: t('validation.two_factor_code_max_length'),
        }),
    })
    .strict();
