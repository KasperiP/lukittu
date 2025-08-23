import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type SetReturnedFieldsSchema = z.infer<
  ReturnType<typeof setReturnedFieldsSchema>
>;

export const setReturnedFieldsSchema = (t: I18nTranslator) =>
  z
    .object({
      licenseIpLimit: z.boolean(),
      licenseHwidLimit: z.boolean(),
      licenseExpirationType: z.boolean(),
      licenseExpirationStart: z.boolean(),
      licenseExpirationDate: z.boolean(),
      licenseExpirationDays: z.boolean(),
      licenseMetadataKeys: z.array(
        z
          .string()
          .min(1, {
            message: t?.('validation.metadata_key_min_length'),
          })
          .max(255, {
            message: t?.('validation.metadata_key_max_length'),
          }),
      ),
      customerEmail: z.boolean(),
      customerFullName: z.boolean(),
      customerUsername: z.boolean(),
      customerMetadataKeys: z.array(
        z
          .string()
          .min(1, {
            message: t?.('validation.metadata_key_min_length'),
          })
          .max(255, {
            message: t?.('validation.metadata_key_max_length'),
          }),
      ),
      productName: z.boolean(),
      productUrl: z.boolean(),
      productLatestRelease: z.boolean(),
      productMetadataKeys: z.array(
        z
          .string()
          .min(1, {
            message: t?.('validation.metadata_key_min_length'),
          })
          .max(255, {
            message: t?.('validation.metadata_key_max_length'),
          }),
      ),
    })
    .strict();
