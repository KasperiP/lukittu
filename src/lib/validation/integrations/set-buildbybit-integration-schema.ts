import { I18nTranslator } from '@/types/i18n-types';
import { z } from 'zod';

export type SetBuildByBitIntegrationSchema = z.infer<
  ReturnType<typeof setBuildByBitIntegrationSchema>
>;

export const setBuildByBitIntegrationSchema = (t: I18nTranslator) =>
  z
    .object({
      active: z.boolean(),
      apiSecret: z
        .string({
          required_error: t('validation.buildbybit_secret_required'),
        })
        .regex(/^bbb_[A-Za-z0-9]{64}$/, {
          message: t('validation.buildbybit_secret_invalid'),
        }),
    })
    .strict();
