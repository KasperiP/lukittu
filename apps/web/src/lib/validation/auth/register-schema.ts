import { I18nTranslator } from '@/types/i18n-types';
import { regex } from '@lukittu/shared';
import { z } from 'zod';

export type RegisterSchema = z.infer<ReturnType<typeof registerSchema>>;

export const registerSchema = (t: I18nTranslator) =>
  z.object({
    email: z
      .string({
        required_error: t('validation.email_required'),
      })
      .email({
        message: t('validation.invalid_email'),
      }),
    password: z
      .string({
        required_error: t('validation.password_required'),
      })
      .min(6, {
        message: t('validation.password_min_length'),
      })
      .regex(regex.passwordUppercase, t('validation.password_uppercase'))
      .regex(regex.passwordLowercase, t('validation.password_lowercase'))
      .regex(regex.passwordNumber, t('validation.password_number'))
      .regex(regex.passwordSpecial, t('validation.password_special')),
    fullName: z
      .string({
        required_error: t('validation.full_name_required'),
      })
      .min(3, {
        message: t('validation.full_name_min_length'),
      })
      .max(255, {
        message: t('validation.full_name_max_length'),
      }),
    terms: z
      .boolean()
      .refine((v) => v, { message: t('validation.terms_of_service_required') }),
    token: z.string(),
  });
