import WebhookView from '@/components/dashboard/webhooks/view/WebhookView';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { getLanguage } from '@/lib/utils/header-helpers';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function WebhookPage() {
  const t = await getTranslations();
  return (
    <div>
      <Breadcrumb className="mb-2">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/webhooks">
                {t('dashboard.navigation.webhooks')}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
        </BreadcrumbList>
      </Breadcrumb>
      <WebhookView />
    </div>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getLanguage() });

  return {
    title: `${t('dashboard.navigation.webhooks')} | Lukittu`,
  };
}
