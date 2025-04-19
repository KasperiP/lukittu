import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export const metadataSchema = (t?: I18nTranslator) =>
  z.array(
    z.object({
      key: z
        .string()
        .min(1, {
          message: t?.('validation.metadata_key_min_length'),
        })
        .max(255, {
          message: t?.('validation.metadata_key_max_length'),
        }),
      value: z
        .string()
        .min(1, {
          message: t?.('validation.metadata_value_min_length'),
        })
        .max(255, {
          message: t?.('validation.metadata_value_max_length'),
        }),
      locked: z.boolean(),
    }),
  );
