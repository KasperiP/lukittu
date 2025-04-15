import ForgotPasswordCard from '@/components/auth/ForgotPasswordCard';
import { getLanguage } from '@/lib/utils/header-helpers';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export default function ForgotPassword() {
  return <ForgotPasswordCard />;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getLanguage() });

  return {
    title: t('auth.forgot_password.seo_title'),
  };
}
