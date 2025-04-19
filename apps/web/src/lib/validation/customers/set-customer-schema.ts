import { z } from 'zod';
import { metadataSchema } from '../shared/metadata-schema';
import { I18nTranslator } from '@/types/i18n-types';

export type SetCustomerSchema = z.infer<ReturnType<typeof setCustomerSchema>>;

export const setCustomerSchema = (t?: I18nTranslator) =>
  z
    .object({
      email: z
        .string({
          required_error: t?.('validation.email_required'),
        })
        .email({
          message: t?.('validation.invalid_email'),
        }),
      fullName: z
        .string({
          required_error: t?.('validation.full_name_required'),
        })
        .min(3, {
          message: t?.('validation.full_name_min_length'),
        })
        .max(255, {
          message: t?.('validation.full_name_max_length'),
        })
        .nullable(),
      address: z
        .object({
          city: z
            .string({
              required_error: t?.('validation.city_required'),
            })
            .min(2, {
              message: t?.('validation.city_min_length'),
            })
            .max(100, {
              message: t?.('validation.city_max_length'),
            })
            .nullable(),
          country: z
            .string({
              required_error: t?.('validation.country_required'),
            })
            .min(2, {
              message: t?.('validation.country_min_length'),
            })
            .max(100, {
              message: t?.('validation.country_max_length'),
            })
            .nullable(),
          line1: z
            .string({
              required_error: t?.('validation.address_line1_required'),
            })
            .min(5, {
              message: t?.('validation.address_line1_min_length'),
            })
            .max(255, {
              message: t?.('validation.address_line1_max_length'),
            })
            .nullable(),
          line2: z
            .string({
              required_error: t?.('validation.address_line2_required'),
            })
            .max(255, {
              message: t?.('validation.address_line2_max_length'),
            })
            .nullable(),
          postalCode: z
            .string({
              required_error: t?.('validation.postal_code_required'),
            })
            .min(3, {
              message: t?.('validation.postal_code_min_length'),
            })
            .max(20, {
              message: t?.('validation.postal_code_max_length'),
            })
            .nullable(),
          state: z
            .string({
              required_error: t?.('validation.state_required'),
            })
            .min(2, {
              message: t?.('validation.state_min_length'),
            })
            .max(100, {
              message: t?.('validation.state_max_length'),
            })
            .nullable(),
        })
        .optional(),
      metadata: metadataSchema(t),
    })
    .strict()
    .refine(
      (data) => {
        if (!data.email && !data.fullName) {
          return false;
        }
        return true;
      },
      {
        message: t?.('validation.email_or_full_name_required'),
        path: ['email'],
      },
    );
