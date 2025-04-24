import { z } from 'zod';

export type PlaceholderBuiltByBitSchema = z.infer<
  ReturnType<typeof placeholderBuiltByBitSchema>
>;

export const placeholderBuiltByBitSchema = () =>
  z
    .object({
      builtbybit: z.literal('1'),
      steam_id: z.union([z.literal('null'), z.string().min(1)]),
      user_id: z.string().min(1, {
        message: 'User ID is required',
      }),
      resource_id: z.string().min(1, {
        message: 'Resource ID is required',
      }),
      version_id: z.string().min(1, {
        message: 'Version ID is required',
      }),
      version_number: z.string().min(1, {
        message: 'Version number is required',
      }),
      secret: z
        .string({
          required_error: 'API Secret is required',
        })
        .regex(/^bbb_[A-Za-z0-9]{64}$/, {
          message: 'Invalid API Secret format',
        }),
    })
    .strict();
