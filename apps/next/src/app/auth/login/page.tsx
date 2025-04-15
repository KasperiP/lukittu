import LoginCard from '@/components/auth/LoginCard';
import { getLanguage } from '@/lib/utils/header-helpers';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export default function Login() {
  return <LoginCard />;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getLanguage() });

  return {
    title: t('auth.login.seo_title'),
  };
}
