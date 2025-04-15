import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type SetTeamValidationSettingsSchema = z.infer<
  ReturnType<typeof setTeamValidationSettingsSchema>
>;

export const setTeamValidationSettingsSchema = (t: I18nTranslator) =>
  z
    .object({
      strictProducts: z.boolean(),
      strictCustomers: z.boolean(),
      strictReleases: z.boolean(),
      ipLimitPeriod: z.enum(['DAY', 'WEEK', 'MONTH']),
      deviceTimeout: z
        .number()
        .positive({ message: t('validation.device_timeout_positive') })
        .int(),
    })
    .strict();
