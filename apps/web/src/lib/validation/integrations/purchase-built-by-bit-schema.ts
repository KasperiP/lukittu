import { z } from 'zod';

export type PurchaseBuiltByBitSchema = z.infer<
  ReturnType<typeof purchaseBuiltByBitSchema>
>;

export const purchaseBuiltByBitSchema = () =>
  z.object({
    apiSecret: z
      .string({
        required_error: 'API Secret is required',
      })
      .regex(/^bbb_[A-Za-z0-9]{64}$/, {
        message: 'Invalid API Secret format',
      }),
    builtByBitData: z.object({
      user: z.object({
        id: z.string().regex(/^\d+$/, {
          message: 'User ID must be numeric',
        }),
        username: z.string({
          required_error: 'Username is required',
        }),
        userUrl: z
          .string({
            required_error: 'User URL is required',
          })
          .url({
            message: 'Invalid user URL format',
          }),
      }),
      resource: z.object({
        title: z.string({
          required_error: 'Resource title is required',
        }),
        id: z
          .string({
            required_error: 'Resource ID is required',
          })
          .regex(/^\d+$/, {
            message: 'Resource ID must be numeric',
          }),
        url: z
          .string({
            required_error: 'Resource URL is required',
          })
          .url({
            message: 'Invalid resource URL format',
          }),
        addon: z.object({
          id: z
            .string({
              required_error: 'Addon ID is required',
            })
            .regex(/^\d+$/, {
              message: 'Addon ID must be numeric',
            }),
          title: z.string({
            required_error: 'Addon title is required',
          }),
        }),
        bundle: z.object({
          id: z
            .string({
              required_error: 'Bundle ID is required',
            })
            .regex(/^\d+$/, {
              message: 'Bundle ID must be numeric',
            }),
          title: z.string({
            required_error: 'Bundle title is required',
          }),
        }),
        renewal: z.string({
          required_error: 'Renewal information is required',
        }),
        pricing: z.object({
          listPrice: z
            .string({
              required_error: 'List price is required',
            })
            .regex(/^\d+(\.\d+)?$/, {
              message: 'List price must be numeric',
            }),
          finalPrice: z
            .string({
              required_error: 'Final price is required',
            })
            .regex(/^\d+(\.\d+)?$/, {
              message: 'Final price must be numeric',
            }),
        }),
        purchaseDate: z
          .string({
            required_error: 'Purchase date is required',
          })
          .regex(/^\d+$/, {
            message: 'Purchase date must be a numeric timestamp',
          }),
      }),
    }),
    lukittuData: z.object({
      productId: z
        .string({
          required_error: 'Product ID is required',
        })
        .uuid({
          message: 'Product ID must be a valid UUID',
        }),
      ipLimit: z
        .number({
          required_error: 'IP Limit is required',
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
          required_error: 'HWID Limit is required',
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
          required_error: 'Expiration days are required',
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
    }),
  });
