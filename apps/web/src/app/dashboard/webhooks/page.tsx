import { WebhooksTable } from '@/components/dashboard/webhooks/list/WebhooksTable';
import { Separator } from '@/components/ui/separator';
import { getLanguage } from '@/lib/utils/header-helpers';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export default async function WebhooksPage() {
  const t = await getTranslations({ locale: await getLanguage() });
  return (
    <div>
      <h1 className="text-2xl font-bold">
        {t('dashboard.navigation.webhooks')}
      </h1>
      <Separator className="mt-2" />
      <div className="mt-6 flex flex-col gap-6">
        <WebhooksTable />
      </div>
    </div>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getLanguage() });

  return {
    title: `${t('dashboard.navigation.webhooks')} | Lukittu`,
  };
}
