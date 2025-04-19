'use client';
import {
  ILicensesGetResponse,
  ILicensesGetSuccessResponse,
} from '@/app/api/(dashboard)/licenses/route';
import { DateConverter } from '@/components/shared/DateConverter';
import { CustomerFilterChip } from '@/components/shared/filtering/CustomerFilterChip';
import {
  ComparisonMode,
  IpCountFilterChip,
} from '@/components/shared/filtering/IpCountFilterChip';
import { LicenseStatusFilterChip } from '@/components/shared/filtering/LicenseStatusFilterChip';
import { MetadataFilterChip } from '@/components/shared/filtering/MetadataFilterChip';
import { ProductFilterChip } from '@/components/shared/filtering/ProductFilterChip';
import { CustomersMultiselect } from '@/components/shared/form/CustomersMultiselect';
import { ProductsMultiselect } from '@/components/shared/form/ProductsMultiselect';
import AddEntityButton from '@/components/shared/misc/AddEntityButton';
import MobileFilterModal from '@/components/shared/table/MobileFiltersModal';
import TablePagination from '@/components/shared/table/TablePagination';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
import { Badge } from '@/components/ui/badge';
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
import {
  getLicenseStatusBadgeVariant,
  LicenseStatus,
} from '@/lib/licenses/license-badge-variant';
import { cn } from '@/lib/utils/tailwind-helpers';
import { LicenseModalProvider } from '@/providers/LicenseModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { getLicenseStatus } from '@lukittu/shared';
import {
  AlertTriangle,
  ArrowDownUp,
  Box,
  CheckCircle,
  Clock,
  Filter,
  Key,
  Search,
  Users,
  XCircle,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { LicensesActionDropdown } from '../LicensesActionDropdown';

const fetchLicenses = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ILicensesGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

const StatusBadge = ({ status, t }: { status: LicenseStatus; t: any }) => {
  const icons = {
    success: <CheckCircle className="mr-1 h-3 w-3" />,
    error: <XCircle className="mr-1 h-3 w-3" />,
    warning: <AlertTriangle className="mr-1 h-3 w-3" />,
  };

  const variant = getLicenseStatusBadgeVariant(status);
  const icon = icons[variant as keyof typeof icons];

  return (
    <Badge className="text-xs" variant={variant}>
      {icon}
      {t(`general.${status.toLowerCase()}`)}
    </Badge>
  );
};

export function LicensesTable() {
  const locale = useLocale();
  const t = useTranslations();
  const router = useRouter();
  const { showDropdown, containerRef } = useTableScroll();
  const teamCtx = useContext(TeamContext);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [debounceSearch, setDebounceSearch] = useState('');
  const [search, setSearch] = useState('');
  const [productIds, setProductIds] = useState<string[]>([]);
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortColumn, setSortColumn] = useState<
    'createdAt' | 'updatedAt' | null
  >(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
    null,
  );
  const [tempProductIds, setTempProductIds] = useState<string[]>([]);
  const [tempCustomerIds, setTempCustomerIds] = useState<string[]>([]);
  const [metadataKey, setMetadataKey] = useState('');
  const [metadataValue, setMetadataValue] = useState('');
  const [tempMetadataKey, setTempMetadataKey] = useState('');
  const [tempMetadataValue, setTempMetadataValue] = useState('');
  const [ipCountMin, setIpCountMin] = useState('');
  const [ipCountMax, setIpCountMax] = useState('');
  const [tempIpCountMin, setTempIpCountMin] = useState('');
  const [tempIpCountMax, setTempIpCountMax] = useState('');
  const [ipCountComparisonMode, setIpCountComparisonMode] =
    useState<ComparisonMode>('');
  const [tempIpCountComparisonMode, setTempIpCountComparisonMode] =
    useState<ComparisonMode>('equals');
  const [status, setStatus] = useState<LicenseStatus | 'all'>('all');
  const [tempStatus, setTempStatus] = useState<LicenseStatus | 'all'>('all');

  const searchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(sortColumn && { sortColumn }),
    ...(sortDirection && { sortDirection }),
    ...(search && { search }),
    ...(productIds.length && { productIds: productIds.join(',') }),
    ...(customerIds.length && { customerIds: customerIds.join(',') }),
    ...(metadataKey && { metadataKey }),
    ...(metadataValue && { metadataValue }),
    ...(ipCountMin && { ipCountMin }),
    ...(ipCountMax && ipCountComparisonMode === 'between' && { ipCountMax }),
    ...(ipCountComparisonMode && { ipCountComparisonMode }),
    ...(status !== 'all' && { status }),
  });

  const { data, error, isLoading } = useSWR<ILicensesGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/licenses', teamCtx.selectedTeam, searchParams.toString()]
      : null,
    ([url, _, params]) => fetchLicenses(`${url}?${params}`),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const licenses = data?.licenses ?? [];
  const totalLicenses = data?.totalResults ?? 0;
  const hasLicenses = data?.hasResults ?? true;

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
          placeholder={t('dashboard.licenses.search_license')}
          value={debounceSearch}
          onChange={(e) => {
            setDebounceSearch(e.target.value);
          }}
        />
      </div>

      <ProductFilterChip
        productIds={productIds}
        setProductIds={setProductIds}
        setTempProductIds={setTempProductIds}
        tempProductIds={tempProductIds}
      />

      <CustomerFilterChip
        customerIds={customerIds}
        setCustomerIds={setCustomerIds}
        setTempCustomerIds={setTempCustomerIds}
        tempCustomerIds={tempCustomerIds}
      />

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

      <IpCountFilterChip
        comparisonMode={ipCountComparisonMode}
        ipCountMax={ipCountMax}
        ipCountMin={ipCountMin}
        setComparisonMode={setIpCountComparisonMode}
        setIpCountMax={setIpCountMax}
        setIpCountMin={setIpCountMin}
        setTempComparisonMode={setTempIpCountComparisonMode}
        setTempIpCountMax={setTempIpCountMax}
        setTempIpCountMin={setTempIpCountMin}
        tempComparisonMode={tempIpCountComparisonMode}
        tempIpCountMax={tempIpCountMax}
        tempIpCountMin={tempIpCountMin}
      />

      <LicenseStatusFilterChip
        setStatus={setStatus}
        setTempStatus={setTempStatus}
        status={status}
        tempStatus={tempStatus}
      />

      {(search ||
        productIds.length > 0 ||
        customerIds.length > 0 ||
        status !== 'all' ||
        (metadataKey && metadataValue)) && (
        <Button
          className="h-7 rounded-full text-xs"
          size="sm"
          onClick={() => {
            setDebounceSearch('');
            setSearch('');
            setProductIds([]);
            setTempProductIds([]);
            setCustomerIds([]);
            setTempCustomerIds([]);
            setMetadataKey('');
            setMetadataValue('');
            setTempMetadataKey('');
            setTempMetadataValue('');
            setStatus('all');
            setTempStatus('all');
          }}
        >
          {t('general.clear_all')}
        </Button>
      )}
    </div>
  );

  return (
    <LicenseModalProvider>
      <MobileFilterModal
        filterOptions={[
          {
            type: 'search',
            key: 'search',
            placeholder: t('dashboard.licenses.search_license'),
          },
          {
            type: 'multiselect',
            key: 'products',
            component: (props) => (
              <ProductsMultiselect {...props} selectedProducts={undefined} />
            ),
          },
          {
            type: 'multiselect',
            key: 'customers',
            component: (props) => (
              <CustomersMultiselect {...props} selectedCustomers={undefined} />
            ),
          },
        ]}
        initialFilters={{
          search,
          products: productIds,
          customers: customerIds,
        }}
        open={mobileFiltersOpen}
        title={t('general.filters')}
        onApply={(filters) => {
          setSearch(filters.search);
          setProductIds(filters.products);
          setCustomerIds(filters.customers);
        }}
        onOpenChange={setMobileFiltersOpen}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-xl font-bold">
            {t('dashboard.navigation.licenses')}
            <div className="ml-auto flex gap-2">
              <Button
                className="lg:hidden"
                size="sm"
                variant="outline"
                onClick={() => setMobileFiltersOpen(true)}
              >
                <Filter className="h-4 w-4" />
              </Button>
              <AddEntityButton entityType="license" />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasLicenses && teamCtx.selectedTeam ? (
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
                  : licenses.map((license) => (
                      <Link
                        key={license.id}
                        className="group relative flex items-center justify-between border-b py-3 first:border-t"
                        href={`/dashboard/licenses/${license.id}`}
                        tabIndex={0}
                      >
                        <div className="absolute inset-0 -mx-2 rounded-lg transition-colors group-hover:bg-secondary/80" />
                        <div className="z-10">
                          <span className="sm:hidden">
                            <StatusBadge
                              status={getLicenseStatus(license)}
                              t={t}
                            />
                          </span>
                          <p
                            className="line-clamp-1 break-all font-medium"
                            title={license.licenseKey}
                          >
                            {`${license.licenseKey}`}
                          </p>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <div className="text-sm font-semibold text-muted-foreground">
                                {new Date(license.createdAt).toLocaleString(
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
                            <div className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              <div className="text-sm text-muted-foreground">
                                {license.customers.length}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Box className="h-3.5 w-3.5 text-muted-foreground" />
                              <div className="text-sm text-muted-foreground">
                                {license.products.length}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="z-10 flex items-center space-x-2">
                          <span className="rounded-full px-2 py-1 text-xs font-medium max-sm:hidden">
                            <StatusBadge
                              status={getLicenseStatus(license)}
                              t={t}
                            />
                          </span>
                          <LicensesActionDropdown license={license} />
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
                      {t('general.license')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('dashboard.licenses.status')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.expires_at')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('dashboard.navigation.customers')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('dashboard.navigation.products')}
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
                  <TableSkeleton columns={8} rows={7} />
                ) : (
                  <TableBody>
                    {licenses.map((license) => (
                      <TableRow
                        key={license.id}
                        className="cursor-pointer"
                        onClick={() =>
                          router.push(`/dashboard/licenses/${license.id}`)
                        }
                      >
                        <TableCell className="truncate">
                          {license.licenseKey}
                        </TableCell>
                        <TableCell className="truncate">
                          <StatusBadge
                            status={getLicenseStatus(license)}
                            t={t}
                          />
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={
                            license.expirationDate
                              ? new Date(license.expirationDate).toLocaleString(
                                  locale,
                                )
                              : t('general.never')
                          }
                        >
                          {license.expirationDate ? (
                            <DateConverter date={license.expirationDate} />
                          ) : (
                            t('general.never')
                          )}
                        </TableCell>
                        <TableCell className="truncate">
                          {license.customers.length}
                        </TableCell>
                        <TableCell className="truncate">
                          {license.products.length}
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={new Date(license.createdAt).toLocaleString(
                            locale,
                          )}
                        >
                          <DateConverter date={license.createdAt} />
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={new Date(license.updatedAt).toLocaleString(
                            locale,
                          )}
                        >
                          <DateConverter date={license.updatedAt} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'sticky right-0 w-[50px] truncate px-2 py-0 text-right',
                            {
                              'bg-background drop-shadow-md': showDropdown,
                            },
                          )}
                        >
                          <LicensesActionDropdown license={license} />
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
                totalItems={totalLicenses}
                totalPages={Math.ceil(totalLicenses / pageSize)}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex w-full max-w-xl flex-col items-center justify-center gap-4">
                <div className="flex">
                  <span className="rounded-lg bg-secondary p-4">
                    <Key className="h-6 w-6" />
                  </span>
                </div>
                <h3 className="text-lg font-bold">
                  {t('dashboard.licenses.add_your_first_license')}
                </h3>
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  {t('dashboard.licenses.license_description')}
                </p>
                <div>
                  <AddEntityButton entityType="license" displayText />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </LicenseModalProvider>
  );
}
