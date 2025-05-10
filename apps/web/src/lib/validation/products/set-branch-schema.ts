import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type SetBranchSchema = z.infer<ReturnType<typeof setBranchSchema>>;

export const setBranchSchema = (t: I18nTranslator) =>
  z
    .object({
      name: z
        .string({
          required_error: t('validation.branch_name_required'),
        })
        .min(2, {
          message: t('validation.branch_name_min_length'),
        })
        .max(255, {
          message: t('validation.branch_name_max_length'),
        })
        .regex(/^[a-zA-Z0-9_-]+$/, {
          message: t('validation.branch_name_invalid'),
        }),
      productId: z
        .string({
          message: t('validation.release_product_required'),
        })
        .uuid({
          message: t('validation.release_product_required'),
        }),
    })
    .strict();
