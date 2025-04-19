'use client';
import {
  ICustomerGetResponse,
  ICustomerGetSuccessResponse,
} from '@/app/api/(dashboard)/customers/[slug]/route';
import MetadataAside from '@/components/shared/misc/MetadataAside';
import LicensesPreviewTable from '@/components/shared/table/preview/LicensesPreviewTable';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { CustomerModalProvider } from '@/providers/CustomerModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useContext, useEffect } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { CustomersActionDropdown } from '../CustomersActionDropdown';
import { CustomerDetails } from './CustomerDetails';

const fetchCustomer = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ICustomerGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function CustomerView() {
  const teamCtx = useContext(TeamContext);
  const params = useParams();
  const t = useTranslations();
  const router = useRouter();
  const customerId = params.slug as string;

  const { data, error, isLoading } = useSWR<ICustomerGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/customers', customerId, teamCtx.selectedTeam]
      : null,
    ([url, customerId]) => fetchCustomer(`${url}/${customerId}`),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
      router.push('/dashboard/customers');
    }
  }, [error, router, t]);

  const customer = data?.customer;

  return (
    <CustomerModalProvider>
      <div className="flex items-center justify-between gap-2">
        {isLoading ? (
          <Skeleton className="h-8 w-96" />
        ) : (
          <h1 className="truncate text-2xl font-bold">
            {customer?.fullName ?? customer?.email}
          </h1>
        )}
        <CustomersActionDropdown customer={customer!} variant="outline" />
      </div>
      <Separator className="mt-2" />
      <div className="mt-6">
        <div className="flex">
          <div className="flex w-full gap-4 max-xl:flex-col-reverse">
            <div className="flex w-full max-w-full flex-col gap-4 overflow-auto">
              <LicensesPreviewTable customerId={customerId} />
            </div>
            <aside className="flex w-full max-w-96 flex-shrink-0 flex-col gap-4 max-xl:max-w-full">
              <CustomerDetails customer={customer ?? null} />
              <MetadataAside metadata={customer?.metadata ?? null} />
            </aside>
          </div>
        </div>
      </div>
    </CustomerModalProvider>
  );
}
