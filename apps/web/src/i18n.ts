import { getRequestConfig } from 'next-intl/server';
import { getLanguage } from './lib/utils/header-helpers';

export default getRequestConfig(async () => {
  const locale = await getLanguage();

  return {
    locale,
    messages: (await import(`./locales/${locale}.json`)).default,
  };
});
