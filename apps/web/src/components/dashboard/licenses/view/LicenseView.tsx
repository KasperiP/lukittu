'use client';
import {
  ILicenseGetResponse,
  ILicenseGetSuccessResponse,
} from '@/app/api/(dashboard)/licenses/[slug]/route';
import MetadataAside from '@/components/shared/misc/MetadataAside';
import IpAddressPreviewTable from '@/components/shared/table/preview/IpAddressPreviewTable';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { LicenseModalProvider } from '@/providers/LicenseModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useContext, useEffect } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import CustomersPreviewTable from '../../../shared/table/preview/CustomersPreviewTable';
import DevicesPreviewTable from '../../../shared/table/preview/DevicesPreviewTable';
import ProductsPreviewTable from '../../../shared/table/preview/ProductsPreviewTable';
import RequestLogsPreviewTable from '../../../shared/table/preview/RequestLogsPreviewTable';
import { RequestsAreaChart } from '../../statistics/RequestsAreaChart';
import WorldMapChart from '../../statistics/WorldMapChart';
import { LicensesActionDropdown } from '../LicensesActionDropdown';
import { LicenseDetails } from './LicenseDetails';

const fetchLicense = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ILicenseGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function LicenseView() {
  const params = useParams();
  const t = useTranslations();
  const router = useRouter();
  const teamCtx = useContext(TeamContext);
  const licenseId = params.slug as string;

  const { data, error, isLoading } = useSWR<ILicenseGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/licenses', licenseId, teamCtx.selectedTeam]
      : null,
    ([url, licenseId]) => fetchLicense(`${url}/${licenseId}`),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
      router.push('/dashboard/licenses');
    }
  }, [error, router, t]);

  const license = data?.license;

  return (
    <LicenseModalProvider>
      <div className="flex items-center justify-between gap-2">
        {isLoading ? (
          <Skeleton className="h-8 w-96" />
        ) : (
          <h1 className="truncate text-2xl font-bold">{license?.licenseKey}</h1>
        )}
        <LicensesActionDropdown license={license!} variant="outline" />
      </div>
      <Separator className="mt-2" />
      <div className="mt-6">
        <div className="flex">
          <div className="flex w-full gap-4 max-xl:flex-col-reverse">
            <div className="flex w-full max-w-full flex-col gap-4 overflow-auto">
              <ProductsPreviewTable license={license} licenseId={licenseId} />
              <CustomersPreviewTable license={license} licenseId={licenseId} />
              <RequestLogsPreviewTable licenseId={licenseId} />
              <IpAddressPreviewTable licenseId={licenseId} />
              <DevicesPreviewTable licenseId={licenseId} />
              <RequestsAreaChart licenseId={licenseId} />
              <WorldMapChart licenseId={licenseId} />
            </div>
            <aside className="flex w-full max-w-96 flex-shrink-0 flex-col gap-4 max-xl:max-w-full">
              <LicenseDetails license={license ?? null} />
              <MetadataAside metadata={license?.metadata ?? null} />
            </aside>
          </div>
        </div>
      </div>
    </LicenseModalProvider>
  );
}
