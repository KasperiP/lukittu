import VerifyEmailCard from '@/components/auth/VerifyEmailCard';
import { getLanguage } from '@/lib/utils/header-helpers';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export default async function VerifyEmail() {
  return <VerifyEmailCard />;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getLanguage() });

  return {
    title: t('auth.verify_email.seo_title'),
  };
}
