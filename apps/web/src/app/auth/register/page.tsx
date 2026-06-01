import RegisterCard from '@/components/auth/RegisterCard';
import { getLanguage } from '@/lib/utils/header-helpers';
import { isSingleTenantMode } from '@/lib/utils/single-tenant';
import { prisma } from '@lukittu/shared';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export default async function Register() {
  // In single-tenant mode, public registration is closed once the first user
  // exists. Invited users can still register (the API allows emails with a
  // pending invitation), so the form stays available with an invite-only notice.
  const singleTenant = isSingleTenantMode();
  const hasUsers = singleTenant
    ? (await prisma.user.findFirst({ select: { id: true } })) !== null
    : false;

  return <RegisterCard invitationOnly={singleTenant && hasUsers} />;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getLanguage() });

  return {
    title: t('auth.register.seo_title'),
  };
}
