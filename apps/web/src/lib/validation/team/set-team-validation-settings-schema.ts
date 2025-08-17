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
      hwidTimeout: z
        .number()
        .positive({ message: t('validation.hwid_timeout_positive') })
        .max(259200, { message: t('validation.hwid_timeout_max') })
        .int()
        .nullable(),
      ipTimeout: z
        .number()
        .positive({ message: t('validation.ip_timeout_positive') })
        .max(259200, { message: t('validation.ip_timeout_max') })
        .int()
        .nullable(),
    })
    .strict();
