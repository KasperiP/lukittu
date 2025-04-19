import { CustomersTable } from '@/components/dashboard/customers/list/CustomersTable';
import { Separator } from '@/components/ui/separator';
import { getLanguage } from '@/lib/utils/header-helpers';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export default async function CustomersPage() {
  const t = await getTranslations({ locale: await getLanguage() });
  return (
    <div>
      <h1 className="text-2xl font-bold">
        {t('dashboard.navigation.customers')}
      </h1>
      <Separator className="mt-2" />
      <div className="mt-6 flex flex-col gap-6">
        <CustomersTable />
      </div>
    </div>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getLanguage() });

  return {
    title: `${t('dashboard.navigation.customers')} | Lukittu`,
  };
}
