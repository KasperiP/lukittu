'use client';
import {
  ICustomersGetResponse,
  ICustomersGetSuccessResponse,
} from '@/app/api/(dashboard)/customers/route';
import { DateConverter } from '@/components/shared/DateConverter';
import { ComparisonMode } from '@/components/shared/filtering/IpCountFilterChip';
import { LicenseCountFilterChip } from '@/components/shared/filtering/LicenseCountFilterChip';
import { MetadataFilterChip } from '@/components/shared/filtering/MetadataFilterChip';
import AddEntityButton from '@/components/shared/misc/AddEntityButton';
import MobileFilterModal from '@/components/shared/table/MobileFiltersModal';
import TablePagination from '@/components/shared/table/TablePagination';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import { CustomerModalProvider } from '@/providers/CustomerModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { ArrowDownUp, Clock, Filter, Search, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { CustomersActionDropdown } from '../CustomersActionDropdown';

const fetchCustomers = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ICustomersGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export function CustomersTable() {
  const locale = useLocale();
  const t = useTranslations();
  const router = useRouter();
  const { showDropdown, containerRef } = useTableScroll();
  const teamCtx = useContext(TeamContext);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [debounceSearch, setDebounceSearch] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortColumn, setSortColumn] = useState<
    'createdAt' | 'updatedAt' | 'fullName' | 'email' | 'username' | null
  >(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
    null,
  );
  const [metadataKey, setMetadataKey] = useState('');
  const [metadataValue, setMetadataValue] = useState('');
  const [tempMetadataKey, setTempMetadataKey] = useState('');
  const [tempMetadataValue, setTempMetadataValue] = useState('');
  const [licenseCountMin, setLicenseCountMin] = useState('');
  const [licenseCountMax, setLicenseCountMax] = useState('');
  const [tempLicenseCountMin, setTempLicenseCountMin] = useState('');
  const [tempLicenseCountMax, setTempLicenseCountMax] = useState('');
  const [licenseCountComparisonMode, setLicenseCountComparisonMode] =
    useState<ComparisonMode>('');
  const [tempLicenseCountComparisonMode, setTempLicenseCountComparisonMode] =
    useState<ComparisonMode>('equals');

  const searchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(sortColumn && { sortColumn }),
    ...(sortDirection && { sortDirection }),
    ...(search && { search }),
    ...(metadataKey && { metadataKey }),
    ...(metadataValue && { metadataValue }),
    ...(licenseCountMin && { licenseCountMin }),
    ...(licenseCountMax &&
      licenseCountComparisonMode === 'between' && { licenseCountMax }),
    ...(licenseCountComparisonMode && { licenseCountComparisonMode }),
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

  const customers = data?.customers ?? [];
  const totalCustomers = data?.totalResults ?? 0;
  const hasCustomers = data?.hasResults ?? true;

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(debounceSearch);
    }, 500);

    return () => {
      clearTimeout(timeout);
    };
  }, [debounceSearch]);

  const renderFilters = () => (
    <div className="mb-4 flex flex-wrap items-center gap-4 max-lg:hidden">
      <div className="relative flex w-full min-w-[33%] max-w-xs items-center">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 transform" />
        <Input
          className="pl-8"
          placeholder={t('dashboard.customers.search_customer')}
          value={debounceSearch}
          onChange={(e) => {
            setDebounceSearch(e.target.value);
          }}
        />
      </div>

      <MetadataFilterChip
        metadataKey={metadataKey}
        metadataValue={metadataValue}
        setMetadataKey={setMetadataKey}
        setMetadataValue={setMetadataValue}
        setTempMetadataKey={setTempMetadataKey}
        setTempMetadataValue={setTempMetadataValue}
        tempMetadataKey={tempMetadataKey}
        tempMetadataValue={tempMetadataValue}
      />

      <LicenseCountFilterChip
        comparisonMode={licenseCountComparisonMode}
        licenseCountMax={licenseCountMax}
        licenseCountMin={licenseCountMin}
        setComparisonMode={setLicenseCountComparisonMode}
        setLicenseCountMax={setLicenseCountMax}
        setLicenseCountMin={setLicenseCountMin}
        setTempComparisonMode={setTempLicenseCountComparisonMode}
        setTempLicenseCountMax={setTempLicenseCountMax}
        setTempLicenseCountMin={setTempLicenseCountMin}
        tempComparisonMode={tempLicenseCountComparisonMode}
        tempLicenseCountMax={tempLicenseCountMax}
        tempLicenseCountMin={tempLicenseCountMin}
      />

      {(search || (metadataKey && metadataValue) || licenseCountMin) && (
        <Button
          className="h-7 rounded-full text-xs"
          size="sm"
          onClick={() => {
            setDebounceSearch('');
            setSearch('');
            setMetadataKey('');
            setMetadataValue('');
            setTempMetadataKey('');
            setTempMetadataValue('');
            setLicenseCountMin('');
            setLicenseCountMax('');
            setTempLicenseCountMin('');
            setTempLicenseCountMax('');
            setLicenseCountComparisonMode('');
            setTempLicenseCountComparisonMode('equals');
          }}
        >
          {t('general.clear_all')}
        </Button>
      )}
    </div>
  );

  return (
    <CustomerModalProvider>
      <MobileFilterModal
        filterOptions={[
          {
            type: 'search',
            key: 'search',
            placeholder: t('general.search_customer'),
          },
        ]}
        initialFilters={{ search }}
        open={mobileFiltersOpen}
        title={t('general.filters')}
        onApply={(filters) => setSearch(filters.search)}
        onOpenChange={setMobileFiltersOpen}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-xl font-bold">
            {t('dashboard.navigation.customers')}
            <div className="ml-auto flex gap-2">
              <Button
                className="lg:hidden"
                size="sm"
                variant="outline"
                onClick={() => setMobileFiltersOpen(true)}
              >
                <Filter className="h-4 w-4" />
              </Button>
              <AddEntityButton entityType="customer" />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasCustomers && teamCtx.selectedTeam ? (
            <>
              {renderFilters()}
              <div className="flex flex-col md:hidden">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={index}
                        className="group relative flex items-center justify-between border-b py-3 first:border-t"
                      >
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ))
                  : customers.map((customer) => (
                      <Link
                        key={customer.id}
                        className="group relative flex items-center justify-between border-b py-3 first:border-t"
                        href={`/dashboard/customers/${customer.id}`}
                        tabIndex={0}
                      >
                        <div className="absolute inset-0 -mx-2 rounded-lg transition-colors group-hover:bg-secondary/80" />
                        <div className="z-10">
                          <p className="line-clamp-2 break-all font-medium">
                            {customer.email}
                          </p>
                          <div className="mb-1 line-clamp-1 break-all text-sm font-semibold text-muted-foreground">
                            {customer.fullName ?? t('general.unknown')}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <div className="text-sm font-semibold text-muted-foreground">
                              {new Date(customer.createdAt).toLocaleString(
                                locale,
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: 'numeric',
                                  minute: 'numeric',
                                },
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="z-10 flex items-center space-x-2">
                          <CustomersActionDropdown customer={customer} />
                        </div>
                      </Link>
                    ))}
              </div>
              <Table
                className="relative max-md:hidden"
                containerRef={containerRef as React.RefObject<HTMLDivElement>}
              >
                <TableHeader>
                  <TableRow>
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
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSortColumn('fullName');
                          setSortDirection(
                            sortColumn === 'fullName' && sortDirection === 'asc'
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
                          setSortColumn('username');
                          setSortDirection(
                            sortColumn === 'username' && sortDirection === 'asc'
                              ? 'desc'
                              : 'asc',
                          );
                        }}
                      >
                        {t('general.username')}
                        <ArrowDownUp className="ml-2 h-4 w-4" />
                      </Button>
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
                    <TableHead className="truncate">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSortColumn('updatedAt');
                          setSortDirection(
                            sortColumn === 'updatedAt' &&
                              sortDirection === 'asc'
                              ? 'desc'
                              : 'asc',
                          );
                        }}
                      >
                        {t('general.updated_at')}
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
                  <TableSkeleton columns={6} rows={6} />
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
                          {customer.email ? (
                            customer.email
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="truncate">
                          {customer.fullName ? (
                            customer.fullName
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
                        <TableCell
                          className="truncate"
                          title={new Date(customer.createdAt).toLocaleString(
                            locale,
                          )}
                        >
                          <DateConverter date={customer.createdAt} />
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={new Date(customer.updatedAt).toLocaleString(
                            locale,
                          )}
                        >
                          <DateConverter date={customer.updatedAt} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'sticky right-0 w-[50px] truncate px-2 py-0 text-right',
                            {
                              'bg-background drop-shadow-md': showDropdown,
                            },
                          )}
                        >
                          <CustomersActionDropdown customer={customer} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                )}
              </Table>
              <TablePagination
                page={page}
                pageSize={pageSize}
                setPage={setPage}
                setPageSize={setPageSize}
                totalItems={totalCustomers}
                totalPages={Math.ceil(totalCustomers / pageSize)}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex w-full max-w-xl flex-col items-center justify-center gap-4">
                <div className="flex">
                  <span className="rounded-lg bg-secondary p-4">
                    <Users className="h-6 w-6" />
                  </span>
                </div>
                <h3 className="text-lg font-bold">
                  {t('dashboard.customers.add_your_first_customer')}
                </h3>
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  {t('dashboard.customers.customer_description')}
                </p>
                <div>
                  <AddEntityButton entityType="customer" displayText />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </CustomerModalProvider>
  );
}
