import { countries } from '@/lib/constants/countries';
import { I18nTranslator } from '@/types/i18n-types';
import { BlacklistType } from '@lukittu/shared';
import { z } from 'zod';
import { metadataSchema } from '../shared/metadata-schema';

export type SetBlacklistSchema = z.infer<ReturnType<typeof setBlacklistSchema>>;

export const setBlacklistSchema = (t: I18nTranslator) =>
  z
    .object({
      type: z.enum(['COUNTRY', 'IP_ADDRESS', 'DEVICE_IDENTIFIER']),
      value: z
        .string({
          required_error: t('validation.blacklist_value_required'),
        })
        .min(3, {
          message: t('validation.blacklist_value_min_length'),
        })
        .max(1000, {
          message: t('validation.blacklist_value_max_length'),
        }),
      metadata: metadataSchema(t),
    })
    .strict()
    .refine(
      (data) => {
        const iso3list = countries.map((country) => country.alpha_3_code);
        if (data.type === 'COUNTRY' && !iso3list.includes(data.value)) {
          return false;
        }
        return true;
      },
      {
        message: t('validation.invalid_country'),
        path: ['value'],
      },
    )
    .refine(
      (data) => {
        if (data.type === BlacklistType.IP_ADDRESS) {
          const zodSchema = z.string().ip();
          return zodSchema.safeParse(data.value).success;
        }

        return true;
      },
      {
        message: t('validation.invalid_ip'),
        path: ['value'],
      },
    );
