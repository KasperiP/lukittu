import { z } from 'zod';

export type SetDiscordIntegrationSchema = z.infer<
  ReturnType<typeof setDiscordIntegrationSchema>
>;

export const setDiscordIntegrationSchema = () =>
  z
    .object({
      active: z.boolean(),
    })
    .strict();
