import { z } from 'zod';

export type CreateApiKeySchema = z.infer<ReturnType<typeof createApiKeySchema>>;

export const createApiKeySchema = () =>
  z
    .object({
      expiresAt: z.coerce.date().nullable(),
    })
    .strict();
