import GeneralSettingsCard from '@/components/dashboard/profile/GeneralSettingsCard';
import SessionsTable from '@/components/dashboard/profile/LoginSessionsCard';
import TeamsTable from '@/components/dashboard/profile/TeamsTable';
import ThirdPartyConnectionsCard from '@/components/dashboard/profile/ThirdPartyConnectionsCard';
import { Separator } from '@/components/ui/separator';
import { getLanguage } from '@/lib/utils/header-helpers';
import { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export default function ProfilePage() {
  const t = useTranslations();
  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">{t('general.profile')}</h1>
        <Separator className="mt-2" />
      </div>
      <div className="mt-6 flex flex-col gap-6">
        <GeneralSettingsCard />
        <ThirdPartyConnectionsCard />
        <SessionsTable />
        <TeamsTable />
      </div>
    </>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getLanguage() });

  return {
    title: `${t('general.profile')} | Lukittu`,
  };
}
