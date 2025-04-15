import RegisterCard from '@/components/auth/RegisterCard';
import { getLanguage } from '@/lib/utils/header-helpers';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export default function Register() {
  return <RegisterCard />;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getLanguage() });

  return {
    title: t('auth.register.seo_title'),
  };
}
