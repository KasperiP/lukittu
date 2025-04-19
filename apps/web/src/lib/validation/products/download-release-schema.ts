import { regex } from '@lukittu/shared';
import { z } from 'zod';

export type DownloadReleaseSchema = z.infer<
  ReturnType<typeof downloadReleaseSchema>
>;

export const downloadReleaseSchema = () =>
  z
    .object({
      licenseKey: z
        .string({ message: 'License key must be a string' })
        .regex(regex.licenseKey, {
          message:
            'License key must be in the format of XXXXX-XXXXX-XXXXX-XXXXX-XXXXX',
        }),
      productId: z
        .string({
          message: 'Product UUID must be a string',
          required_error: 'Product UUID is required',
        })
        .uuid({
          message: 'Product UUID must be a valid UUID',
        }),
      sessionKey: z
        .string({ message: 'Session key must be a string' })
        .min(10, {
          message: 'Session key must be at least 10 characters',
        })
        .max(1000, {
          message: 'Session key must be less than 1000 characters',
        })
        .regex(/^[^\s]+$/, {
          message: 'Session key must not contain spaces',
        }),
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
        }),
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
      customerId: z
        .string({ message: 'Customer UUID must be a string' })
        .uuid({
          message: 'Customer UUID must be a valid UUID',
        })
        .optional(),
    })
    .strict({ message: 'Invalid payload' });
