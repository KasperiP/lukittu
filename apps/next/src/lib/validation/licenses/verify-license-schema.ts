import { regex } from '@/lib/constants/regex';
import { z } from 'zod';

export type VerifyLicenseSchema = z.infer<
  ReturnType<typeof verifyLicenseSchema>
>;

export const verifyLicenseSchema = () =>
  z
    .object({
      licenseKey: z
        .string({ message: 'License key must be a string' })
        .regex(regex.licenseKey, {
          message:
            'License key must be in the format of XXXXX-XXXXX-XXXXX-XXXXX-XXXXX',
        }),
      customerId: z
        .string({ message: 'Customer UUID must be a string' })
        .uuid({
          message: 'Customer UUID must be a valid UUID',
        })
        .optional(),
      productId: z
        .string({ message: 'Product UUID must be a string' })
        .uuid({
          message: 'Product UUID must be a valid UUID',
        })
        .optional(),
      challenge: z
        .string({ message: 'Challenge must be a string' })
        .max(1000, { message: 'Challenge must be less than 1000 characters' })
        .regex(/^[^\s]+$/, { message: 'Challenge must not contain spaces' })
        .optional(),
      version: z
        .string({
          message: 'Version must be a string',
        })
        .min(3, {
          message: 'Version must be at least 3 characters',
        })
        .max(255, {
          message: 'Version must be less than 255 characters',
        })
        .regex(/^[^\s]+$/, {
          message: 'Version must not contain spaces',
        })
        .optional(),
      deviceIdentifier: z
        .string({
          message: 'Device identifier must be a string',
        })
        .min(10, {
          message: 'Device identifier must be at least 10 characters',
        })
        .max(1000, {
          message: 'Device identifier must be less than 1000 characters',
        })
        .regex(/^[^\s]+$/, {
          message: 'Device identifier must not contain spaces',
        })
        .optional(),
    })
    .strict({ message: 'Invalid payload' });
