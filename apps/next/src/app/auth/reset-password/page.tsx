import ResetPasswordCard from '@/components/auth/ResetPasswordCard';
import { getLanguage } from '@/lib/utils/header-helpers';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export default async function ResetPassword() {
  return <ResetPasswordCard />;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getLanguage() });

  return {
    title: t('auth.reset_password.seo_title'),
  };
}
