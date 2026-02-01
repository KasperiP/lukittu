import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type VerifyTwoFactorSchema = z.infer<
  ReturnType<typeof verifyTwoFactorSchema>
>;

export const verifyTwoFactorSchema = (t: I18nTranslator) =>
  z
    .object({
      twoFactorToken: z.string({
        required_error: t('validation.two_factor_token_required'),
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
      rememberMe: z.boolean().default(false),
    })
    .strict();
