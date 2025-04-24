import { z } from 'zod';

export type PurchaseBuiltByBitIntegrationSchema = z.infer<
  ReturnType<typeof purchaseBuiltByBitSchema>
>;

export const purchaseBuiltByBitSchema = () =>
  z
    .object({
      apiSecret: z
        .string({
          required_error: 'API Secret is required',
        })
        .regex(/^bbb_[A-Za-z0-9]{64}$/, {
          message: 'Invalid API Secret format',
        }),
      user: z.object({
        id: z.string().regex(/^\d+$/, { message: 'User ID must be numeric' }),
        username: z.string(),
        userUrl: z.string().url(),
      }),
      resource: z.object({
        title: z.string(),
        id: z
          .string()
          .regex(/^\d+$/, { message: 'Resource ID must be numeric' }),
        url: z.string().url(),
        addon: z.object({
          id: z
            .string()
            .regex(/^\d+$/, { message: 'Addon ID must be numeric' }),
          title: z.string(),
        }),
        bundle: z.object({
          id: z
            .string()
            .regex(/^\d+$/, { message: 'Bundle ID must be numeric' }),
          title: z.string(),
        }),
        renewal: z.string(),
        pricing: z.object({
          listPrice: z
            .string()
            .regex(/^\d+(\.\d+)?$/, { message: 'List price must be numeric' }),
          finalPrice: z
            .string()
            .regex(/^\d+(\.\d+)?$/, { message: 'Final price must be numeric' }),
        }),
        purchaseDate: z.string().regex(/^\d+$/, {
          message: 'Purchase date must be a numeric timestamp',
        }),
      }),
    })
    .strict();
