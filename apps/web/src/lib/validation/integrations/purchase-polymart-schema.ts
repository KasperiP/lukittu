import { z } from 'zod';

export type PurchasePolymartSchema = z.infer<
  ReturnType<typeof purchasePolymartSchema>
>;

export const purchasePolymartSchema = () =>
  z.object({
    event: z.literal('product.user.purchase', {
      errorMap: () => ({ message: 'Event must be product.user.purchase' }),
    }),
    time: z.number({
      required_error: 'Timestamp is required',
      invalid_type_error: 'Timestamp must be a number',
    }),
    nonce: z.string({
      required_error: 'Nonce is required',
    }),
    payload: z.object(
      {
        product: z.object(
          {
            id: z.string({
              required_error: 'Product ID is required',
            }),
            title: z.string({
              required_error: 'Product title is required',
            }),
            subtitle: z.string({
              required_error: 'Product subtitle is required',
            }),
            url: z
              .string({
                required_error: 'Product URL is required',
              })
              .url({
                message: 'Invalid product URL format',
              }),
          },
          {
            required_error: 'Product data is required',
          },
        ),
        user: z.object(
          {
            id: z
              .number({
                required_error: 'User ID is required',
                invalid_type_error: 'User ID must be a number',
              })
              .int(),
          },
          {
            required_error: 'User data is required',
          },
        ),
      },
      {
        required_error: 'Payload is required',
      },
    ),
  });

export type PolymartPurchaseParams = z.infer<
  ReturnType<typeof polymartPurchaseParamsSchema>
>;

export const polymartPurchaseParamsSchema = () =>
  z.object({
    productId: z
      .string({
        required_error: 'Product ID is required',
      })
      .uuid({
        message: 'Product ID must be a valid UUID',
      }),
    ipLimit: z
      .number({
        invalid_type_error: 'IP Limit must be a number',
      })
      .positive({
        message: 'IP Limit must be positive',
      })
      .int({
        message: 'IP Limit must be an integer',
      })
      .max(1000, {
        message: 'IP Limit must not exceed 1000',
      })
      .nullable(),
    hwidLimit: z
      .number({
        invalid_type_error: 'HWID Limit must be a number',
      })
      .min(1, {
        message: 'HWID Limit must be at least 1',
      })
      .positive({
        message: 'HWID Limit must be positive',
      })
      .int({
        message: 'HWID Limit must be an integer',
      })
      .max(1000, {
        message: 'HWID Limit must not exceed 1000',
      })
      .nullable(),
    expirationDays: z
      .number({
        invalid_type_error: 'Expiration days must be a number',
      })
      .positive({
        message: 'Expiration days must be positive',
      })
      .min(1, {
        message: 'Expiration days must be at least 1',
      })
      .max(1000, {
        message: 'Expiration days must not exceed 1000',
      })
      .int({
        message: 'Expiration days must be an integer',
      })
      .nullable(),
    expirationStart: z
      .enum(['CREATION', 'ACTIVATION'], {
        errorMap: () => ({
          message: 'Expiration start must be either CREATION or ACTIVATION',
        }),
      })
      .nullable(),
  });
