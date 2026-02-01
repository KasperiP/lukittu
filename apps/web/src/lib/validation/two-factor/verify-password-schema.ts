import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type VerifyPasswordSchema = z.infer<
  ReturnType<typeof verifyPasswordSchema>
>;

export const verifyPasswordSchema = (t: I18nTranslator) =>
  z
    .object({
      password: z
        .string({
          required_error: t('validation.password_required'),
        })
        .min(6, {
          message: t('validation.password_min_length'),
        }),
    })
    .strict();
