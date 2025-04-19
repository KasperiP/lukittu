import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type CreateApiKeySchema = z.infer<ReturnType<typeof createApiKeySchema>>;

export const createApiKeySchema = (t: I18nTranslator) =>
  z
    .object({
      expiresAt: z.coerce.date().nullable(),
    })
    .strict();
