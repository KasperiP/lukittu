import { I18nTranslator } from '@/types/i18n-types';
import { regex } from '@lukittu/shared';
import { z } from 'zod';
import { metadataSchema } from '../shared/metadata-schema';

export type SetProductSchema = z.infer<ReturnType<typeof setProductSchema>>;

export const setProductSchema = (t: I18nTranslator) =>
  z
    .object({
      name: z
        .string({
          required_error: t('validation.product_name_required'),
        })
        .min(3, {
          message: t('validation.product_name_min_length'),
        })
        .max(255, {
          message: t('validation.product_name_max_length'),
        })
        .regex(regex.generalName, {
          message: t('validation.product_name_invalid'), // Team name can only contain letters, numbers, spaces, and the following characters: - _
        }),
      url: z.union([
        z.string().url({
          message: t('validation.product_url_invalid'),
        }),
        z.literal(''),
      ]),
      discordRoleMapping: z
        .array(
          z
            .object({
              discordRoleId: z.string().regex(regex.discordId, {
                message: t('validation.discord_role_id_invalid'),
              }),
              discordGuildId: z.string().regex(regex.discordId, {
                message: t('validation.discord_guild_id_invalid'),
              }),
            })
            .strict(),
        )
        .optional(),
      metadata: metadataSchema(t),
    })
    .strict();
