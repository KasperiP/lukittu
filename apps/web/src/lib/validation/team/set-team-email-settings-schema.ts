import { z } from 'zod';

export type SetTeamEmailSettingsSchema = z.infer<
  ReturnType<typeof setTeamEmailSettingsSchema>
>;

export const setTeamEmailSettingsSchema = () =>
  z
    .object({
      emailMessage: z.string().max(1000).optional(),
    })
    .strict();
