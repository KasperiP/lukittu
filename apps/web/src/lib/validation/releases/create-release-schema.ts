import { regex } from '@lukittu/shared';
import { z } from 'zod';

export type CreateReleaseSchema = z.infer<
  ReturnType<typeof createReleaseSchema>
>;

export const createReleaseSchema = () =>
  z
    .object({
      version: z.string().min(3).max(255).regex(regex.noSpaces),
      productId: z.string().uuid(),
      status: z.enum(['PUBLISHED', 'DRAFT', 'DEPRECATED', 'ARCHIVED']),
      setAsLatest: z.boolean().optional().default(false),
      branchId: z.string().uuid().nullable().optional().default(null),
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
        .max(20)
        .optional()
        .default([]),
      licenseIds: z.array(z.string().uuid()).max(30).optional().default([]),
    })
    .strict();
