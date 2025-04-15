import { z } from 'zod';
import { metadataSchema } from '../shared/metadata-schema';
import { I18nTranslator } from '@/types/i18n-types';

export type SetReleaseSchema = z.infer<ReturnType<typeof setReleaseSchema>>;

export const setReleaseSchema = (t: I18nTranslator) =>
  z
    .object({
      version: z
        .string({
          required_error: t('validation.release_version_required'),
        })
        .min(3, {
          message: t('validation.release_version_min_length'),
        })
        .max(255, {
          message: t('validation.release_version_max_length'),
        })
        .regex(/^[^\s]+$/, {
          message: t('validation.invalid_release_version'),
        }),
      productId: z
        .string({
          message: t('validation.release_product_required'),
        })
        .uuid({
          message: t('validation.release_product_required'),
        }),
      setAsLatest: z.boolean(),
      keepExistingFile: z.boolean(),
      status: z.enum(['PUBLISHED', 'DRAFT', 'DEPRECATED', 'ARCHIVED']),
      metadata: metadataSchema(t),
      licenseIds: z.array(z.string().uuid()),
    })
    .strict();
