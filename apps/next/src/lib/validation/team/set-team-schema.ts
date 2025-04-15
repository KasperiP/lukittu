import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type SetTeamSchema = z.infer<ReturnType<typeof setTeamSchema>>;

export const setTeamSchema = (t: I18nTranslator) =>
  z
    .object({
      name: z
        .string({
          required_error: t('validation.team_name_required'),
        })
        .min(3, {
          message: t('validation.team_name_min_length'),
        })
        .max(255, {
          message: t('validation.team_name_max_length'),
        })
        .regex(/^[a-zA-Z0-9\s\-_]+$/, {
          message: t('validation.team_name_invalid'), // Team name can only contain letters, numbers, spaces, and the following characters: - _
        }),
    })
    .strict();
