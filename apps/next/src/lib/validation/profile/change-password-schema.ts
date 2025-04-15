import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type ChangePasswordSchema = z.infer<
  ReturnType<typeof changePasswordSchema>
>;

export const changePasswordSchema = (t: I18nTranslator) =>
  z
    .object({
      password: z
        .string({
          required_error: t('validation.password_required'),
        })
        .min(6, {
          message: t('validation.password_min_length'),
        })
        .regex(/[A-Z]/, t('validation.password_uppercase'))
        .regex(/[a-z]/, t('validation.password_lowercase'))
        .regex(/\d/, t('validation.password_number'))
        .regex(/[!@#$%^&*(),.?":{}|<>]/, t('validation.password_special')),
      newPassword: z
        .string({
          required_error: t('validation.password_required'),
        })
        .min(6, {
          message: t('validation.password_min_length'),
        })
        .regex(/[A-Z]/, t('validation.password_uppercase'))
        .regex(/[a-z]/, t('validation.password_lowercase'))
        .regex(/\d/, t('validation.password_number'))
        .regex(/[!@#$%^&*(),.?":{}|<>]/, t('validation.password_special')),
      passwordConfirmation: z
        .string({
          required_error: t('validation.password_confirmation_required'),
        })
        .min(6, {
          message: t('validation.password_min_length'),
        }),
    })
    .refine((data) => data.newPassword === data.passwordConfirmation, {
      message: t('validation.password_mismatch'),
      path: ['passwordConfirmation'],
    });
