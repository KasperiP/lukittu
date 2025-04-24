import {
  ICustomersGetResponse,
  ICustomersGetSuccessResponse,
} from '@/app/api/(dashboard)/customers/route';
import {
  ILicenseGetSuccessResponse,
  ILicensesUpdateResponse,
} from '@/app/api/(dashboard)/licenses/[slug]/route';
import { CustomersActionDropdown } from '@/components/dashboard/customers/CustomersActionDropdown';
import { LicenseCustomersModal } from '@/components/dashboard/licenses/view/LicenseCustomersModal';
import TablePagination from '@/components/shared/table/TablePagination';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTableScroll } from '@/hooks/useTableScroll';
import { cn } from '@/lib/utils/tailwind-helpers';
import { SetLicenseScheama } from '@/lib/validation/licenses/set-license-schema';
import { CustomerModalProvider } from '@/providers/CustomerModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { ArrowDownUp, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR, { useSWRConfig } from 'swr';
import { DateConverter } from '../../DateConverter';

interface CustomersPreviewTableProps {
  licenseId: string;
  license: ILicenseGetSuccessResponse['license'] | undefined;
}

const fetchCustomers = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ICustomersGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function CustomersPreviewTable({
  licenseId,
  license,
}: CustomersPreviewTableProps) {
  const t = useTranslations();
  const router = useRouter();
  const { showDropdown, containerRef } = useTableScroll();
  const teamCtx = useContext(TeamContext);
  const { mutate } = useSWRConfig();

  const [page, setPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<'createdAt' | 'name' | 'email'>(
    'createdAt',
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [customersModalOpen, setCustomersModalOpen] = useState(false);

  const searchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: '10',
    sortColumn,
    sortDirection,
    licenseId,
  });

  const { data, error, isLoading } = useSWR<ICustomersGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/customers', teamCtx.selectedTeam, searchParams.toString()]
      : null,
    ([url, _, params]) => fetchCustomers(`${url}?${params}`),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const handleLicenseEdit = async (payload: SetLicenseScheama) => {
    const response = await fetch(`/api/licenses/${licenseId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ILicensesUpdateResponse;

    return data;
  };

  const handleLicenseCustomersSet = async (customerIds: string[]) => {
    if (!license) {
      toast.error(t('general.error_occurred'));
      return;
    }
    const res = await handleLicenseEdit({
      productIds: license.products.map((p) => p.id),
      customerIds,
      expirationDate: license.expirationDate,
      expirationDays: license.expirationDays,
      expirationStart:
        license.expirationType === 'DURATION' ? license.expirationStart : null,
      expirationType: license.expirationType,
      ipLimit: license.ipLimit,
      licenseKey: license.licenseKey,
      metadata: license.metadata as {
        key: string;
        value: string;
        locked: boolean;
      }[],
      seats: license.seats,
      sendEmailDelivery: false,
      suspended: license.suspended,
    });

    if ('message' in res) {
      toast.error(res.message || t('general.error_occurred'));
      return;
    }

    mutate((key) => Array.isArray(key) && key[0] === '/api/customers');
    mutate((key) => Array.isArray(key) && key[0] === '/api/licenses');

    toast.success(t('dashboard.licenses.license_updated'));
  };

  const openModal = () => {
    setCustomersModalOpen(true);
  };

  const customers = data?.customers ?? [];
  const totalCustomers = data?.totalResults ?? 1;

  return (
    <CustomerModalProvider>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b py-5">
          <CardTitle className="flex w-full items-center text-xl font-bold">
            {t('dashboard.navigation.customers')}
            <div className="ml-auto flex gap-2">
              <Button
                className="ml-auto flex gap-2"
                size="sm"
                variant="outline"
                onClick={openModal}
              >
                <Plus className="h-4 w-4" />
                <span className={cn('max-md:hidden')}>
                  {t('dashboard.customers.add_customer')}
                </span>
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
          {totalCustomers ? (
            <>
              <Table
                className="relative"
                containerRef={containerRef as React.RefObject<HTMLDivElement>}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead className="truncate">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSortColumn('name');
                          setSortDirection(
                            sortColumn === 'name' && sortDirection === 'asc'
                              ? 'desc'
                              : 'asc',
                          );
                        }}
                      >
                        {t('general.full_name')}
                        <ArrowDownUp className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="truncate">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSortColumn('email');
                          setSortDirection(
                            sortColumn === 'email' && sortDirection === 'asc'
                              ? 'desc'
                              : 'asc',
                          );
                        }}
                      >
                        {t('general.email')}
                        <ArrowDownUp className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.username')}
                    </TableHead>
                    <TableHead className="truncate">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSortColumn('createdAt');
                          setSortDirection(
                            sortColumn === 'createdAt' &&
                              sortDirection === 'asc'
                              ? 'desc'
                              : 'asc',
                          );
                        }}
                      >
                        {t('general.created_at')}
                        <ArrowDownUp className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead
                      className={cn(
                        'sticky right-0 w-[50px] truncate px-2 text-right',
                        {
                          'bg-background drop-shadow-md': showDropdown,
                        },
                      )}
                    />
                  </TableRow>
                </TableHeader>
                {isLoading ? (
                  <TableSkeleton columns={4} rows={3} />
                ) : (
                  <TableBody>
                    {customers.map((customer) => (
                      <TableRow
                        key={customer.id}
                        className="cursor-pointer"
                        onClick={() =>
                          router.push(`/dashboard/customers/${customer.id}`)
                        }
                      >
                        <TableCell className="truncate">
                          {customer.fullName ? (
                            customer.fullName
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="truncate">
                          {customer.email ? (
                            customer.email
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="truncate">
                          {customer.username ? (
                            customer.username
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="truncate">
                          <DateConverter date={customer.createdAt} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'sticky right-0 w-[50px] truncate px-2 py-0 text-right',
                            {
                              'bg-background drop-shadow-md': showDropdown,
                            },
                          )}
                        >
                          <CustomersActionDropdown
                            customer={customer}
                            handleLicenseCustomersSet={
                              handleLicenseCustomersSet
                            }
                            license={license}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                )}
              </Table>
              <TablePagination
                page={page}
                pageSize={10}
                setPage={setPage}
                totalItems={totalCustomers}
                totalPages={Math.ceil(totalCustomers / 10)}
              />
            </>
          ) : (
            <div className="flex h-24 flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
              {t('dashboard.licenses.no_customers_assigned')}
            </div>
          )}
        </CardContent>
      </Card>
      <LicenseCustomersModal
        license={license}
        open={customersModalOpen}
        selectedCustomers={customers}
        onOpenChange={setCustomersModalOpen}
        onSubmit={handleLicenseCustomersSet}
      />
    </CustomerModalProvider>
  );
}
