import { regex } from '@lukittu/shared';
import { z } from 'zod';

export type UpdateReleaseSchema = z.infer<
  ReturnType<typeof updateReleaseSchema>
>;

export const updateReleaseSchema = () =>
  z
    .object({
      version: z.string().min(3).max(255).regex(regex.noSpaces),
      productId: z.string().uuid(),
      status: z.enum(['PUBLISHED', 'DRAFT', 'DEPRECATED', 'ARCHIVED']),
      setAsLatest: z.boolean(),
      keepExistingFile: z.boolean(),
      branchId: z.string().uuid().nullable(),
      metadata: z
        .array(
          z
            .object({
              key: z.string().min(1).max(255),
              value: z.string().min(1).max(255),
              locked: z.boolean().optional().default(false),
            })
            .strict(),
        )
        .max(20),
      licenseIds: z.array(z.string().uuid()).max(30),
    })
    .strict();
