import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export type I18nTranslator = Awaited<
  | ReturnType<typeof getTranslations<never>>
  | ReturnType<typeof useTranslations<never>>
>;
