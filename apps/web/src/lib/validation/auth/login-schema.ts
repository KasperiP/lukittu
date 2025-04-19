import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type LoginSchema = z.infer<ReturnType<typeof loginSchema>>;

export const loginSchema = (t: I18nTranslator) =>
  z
    .object({
      email: z
        .string({
          required_error: t('validation.email_required'),
        })
        .email({
          message: t('validation.invalid_email'),
        }),
      password: z
        .string({ message: t('validation.password_required') })
        .min(6, {
          message: t('validation.password_min_length'),
        }),
      rememberMe: z.boolean(),
      token: z.string(),
    })
    .strict();
