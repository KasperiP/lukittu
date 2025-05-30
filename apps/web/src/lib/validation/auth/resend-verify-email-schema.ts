import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type ResendVerifyEmailSchema = z.infer<
  ReturnType<typeof resendVerifyEmailSchema>
>;

export const resendVerifyEmailSchema = (t: I18nTranslator) =>
  z.object({
    email: z
      .string({
        required_error: t('validation.email_required'),
      })
      .email({
        message: t('validation.invalid_email'),
      }),
  });
