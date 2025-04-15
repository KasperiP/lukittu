import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type VerifyEmailSchema = z.infer<ReturnType<typeof verifyEmaiLSchema>>;

export const verifyEmaiLSchema = (t: I18nTranslator) =>
  z
    .object({
      token: z.string({
        required_error: t('validation.token_required'),
      }),
    })
    .strict();
