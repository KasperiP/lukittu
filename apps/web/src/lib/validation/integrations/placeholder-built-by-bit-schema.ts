import { regex } from '@lukittu/shared';
import { z } from 'zod';

export type PlaceholderBuiltByBitSchema = z.infer<
  ReturnType<typeof placeholderBuiltByBitSchema>
>;

export const placeholderBuiltByBitSchema = () =>
  z.object({
    builtbybit: z.string(),
    steam_id: z.string(),
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
      .regex(regex.builtByBitApiSecret, {
        message: 'Invalid API Secret format',
      }),
  });
