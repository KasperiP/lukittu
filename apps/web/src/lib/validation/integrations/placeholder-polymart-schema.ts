import { z } from 'zod';

export type PlaceholderPolymartSchema = z.infer<
  ReturnType<typeof placeholderPolymartSchema>
>;

export const placeholderPolymartSchema = () =>
  z.object({
    user: z
      .number({
        required_error: 'User ID is required',
        invalid_type_error: 'User ID must be a number',
      })
      .int(),
    product: z
      .number({
        required_error: 'Product ID is required',
        invalid_type_error: 'Product ID must be a number',
      })
      .int(),
    nonce: z.string({
      required_error: 'Nonce is required',
    }),
    license: z.string({
      required_error: 'License is required',
    }),
    placeholder: z.string({
      required_error: 'Placeholder is required',
    }),
    time: z
      .number({
        required_error: 'Timestamp is required',
        invalid_type_error: 'Timestamp must be a number',
      })
      .positive(),
    test: z.boolean().optional(),
  });
