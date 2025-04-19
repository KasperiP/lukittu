import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type SetLatestReleaseSchema = z.infer<
  ReturnType<typeof setLatestReleaseSchema>
>;

export const setLatestReleaseSchema = (t: I18nTranslator) =>
  z
    .object({
      releaseId: z
        .string({
          message: t('validation.release_product_required'),
        })
        .uuid({
          message: t('validation.release_product_required'),
        }),
    })
    .strict();
