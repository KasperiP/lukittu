import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type RegenerateBackupCodesSchema = z.infer<
  ReturnType<typeof regenerateBackupCodesSchema>
>;

export const regenerateBackupCodesSchema = (t: I18nTranslator) =>
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
        })
        .refine(
          (code) =>
            /^\d{6}$/.test(code) || /^[A-Z0-9]{8}$/.test(code.toUpperCase()),
          {
            message: t('validation.two_factor_code_invalid'),
          },
        ),
    })
    .strict();
