import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type InviteMemberSchema = z.infer<ReturnType<typeof inviteMemberSchema>>;

export const inviteMemberSchema = (t: I18nTranslator) =>
  z
    .object({
      email: z
        .string({
          required_error: t('validation.email_required'),
        })
        .email({
          message: t('validation.invalid_email'),
        }),
    })
    .strict();
