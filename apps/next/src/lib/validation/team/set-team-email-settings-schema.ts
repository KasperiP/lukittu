import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type SetTeamEmailSettingsSchema = z.infer<
  ReturnType<typeof setTeamEmailSettingsSchema>
>;

export const setTeamEmailSettingsSchema = (t: I18nTranslator) =>
  z
    .object({
      emailMessage: z.string().max(1000).optional(),
    })
    .strict();
