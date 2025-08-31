import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type SetTeamCleanupSettingsSchema = z.infer<
  ReturnType<typeof setTeamCleanupSettingsSchema>
>;

export const setTeamCleanupSettingsSchema = (t: I18nTranslator) =>
  z
    .object({
      expiredLicenseCleanupDays: z
        .number()
        .positive({
          message: t('validation.expired_license_cleanup_days_positive'),
        })
        .min(1, {
          message: t('validation.expired_license_cleanup_days_min', {
            min: '1',
          }),
        })
        .max(1825, {
          message: t('validation.expired_license_cleanup_days_max', {
            max: '1825',
          }),
        })
        .int()
        .nullable(),
      danglingCustomerCleanupDays: z
        .number()
        .positive({
          message: t('validation.dangling_customer_cleanup_days_positive'),
        })
        .min(1, {
          message: t('validation.dangling_customer_cleanup_days_min', {
            min: '1',
          }),
        })
        .max(1825, {
          message: t('validation.dangling_customer_cleanup_days_max', {
            max: '1825',
          }),
        })
        .int()
        .nullable(),
    })
    .strict();
