'use client';
import {
  IProductsGetResponse,
  IProductsGetSuccessResponse,
} from '@/app/api/(dashboard)/products/route';
import { DateConverter } from '@/components/shared/DateConverter';
import { ComparisonMode } from '@/components/shared/filtering/IpCountFilterChip';
import { LicenseCountFilterChip } from '@/components/shared/filtering/LicenseCountFilterChip';
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
import { cn } from '@/lib/utils/tailwind-helpers';
import { ProductModalProvider } from '@/providers/ProductModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import {
  ArrowDownUp,
  Clock,
  Filter,
  Package,
  Rocket,
  Rss,
  Search,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { ProductsActionDropdown } from '../ProductsActionDropdown';

const fetchProducts = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IProductsGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export function ProductsTable() {
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
    'createdAt' | 'updatedAt' | 'name' | null
  >(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
    null,
  );
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
    ...(licenseCountMin && { licenseCountMin }),
    ...(licenseCountMax &&
      licenseCountComparisonMode === 'between' && { licenseCountMax }),
    ...(licenseCountComparisonMode && { licenseCountComparisonMode }),
  });

  const { data, error, isLoading } = useSWR<IProductsGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/products', teamCtx.selectedTeam, searchParams.toString()]
      : null,
    ([url, _, params]) => fetchProducts(`${url}?${params}`),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const products = data?.products ?? [];
  const totalProducts = data?.totalResults ?? 0;
  const hasProducts = data?.hasResults ?? true;

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
          placeholder={t('dashboard.licenses.search_product')}
          value={debounceSearch}
          onChange={(e) => {
            setDebounceSearch(e.target.value);
          }}
        />
      </div>

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

      {(search || licenseCountMin) && (
        <Button
          className="h-7 rounded-full text-xs"
          size="sm"
          onClick={() => {
            setDebounceSearch('');
            setSearch('');
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
    <ProductModalProvider>
      <MobileFilterModal
        filterOptions={[
          {
            type: 'search',
            key: 'search',
            placeholder: t('dashboard.licenses.search_product'),
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
            {t('dashboard.navigation.products')}
            <div className="ml-auto flex gap-2">
              <Button
                className="lg:hidden"
                size="sm"
                variant="outline"
                onClick={() => setMobileFiltersOpen(true)}
              >
                <Filter className="h-4 w-4" />
              </Button>
              <AddEntityButton entityType="product" />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasProducts && teamCtx.selectedTeam ? (
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
                  : products.map((product) => (
                      <div
                        key={product.id}
                        className="group relative flex items-center justify-between border-b py-3 first:border-t"
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          router.push(`/dashboard/products/${product.id}`)
                        }
                      >
                        <div className="absolute inset-0 -mx-2 rounded-lg transition-colors group-hover:bg-secondary/80" />
                        <div className="z-10">
                          <span className="sm:hidden">
                            {product.latestRelease ? (
                              <Badge variant="primary">
                                <Rss className="mr-1 h-3 w-3" />
                                {product.latestRelease}
                              </Badge>
                            ) : null}
                          </span>
                          <p className="line-clamp-2 break-all font-medium">{`${product.name}`}</p>
                          <div className="flex items-center gap-1">
                            {product.url ? (
                              <Link
                                className="line-clamp-1 break-all text-sm font-semibold text-primary"
                                href={product.url}
                              >
                                {product.url}
                              </Link>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                {t('general.unknown')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <div className="text-sm font-semibold text-muted-foreground">
                                {new Date(product.createdAt).toLocaleString(
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
                              <Rocket className="h-3.5 w-3.5 text-muted-foreground" />
                              <div className="text-sm text-muted-foreground">
                                {product.totalReleases}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="z-10 flex items-center space-x-2">
                          <span className="rounded-full px-2 py-1 text-xs font-medium max-sm:hidden">
                            {product.latestRelease ? (
                              <Badge variant="primary">
                                <Rss className="mr-1 h-3 w-3" />
                                {product.latestRelease}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </span>
                          <ProductsActionDropdown product={product} />
                        </div>
                      </div>
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
                          setSortColumn('name');
                          setSortDirection(
                            sortColumn === 'name' && sortDirection === 'asc'
                              ? 'desc'
                              : 'asc',
                          );
                        }}
                      >
                        {t('general.name')}
                        <ArrowDownUp className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.version')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('dashboard.releases.total_releases')}
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
                  <TableSkeleton columns={5} rows={6} />
                ) : (
                  <TableBody>
                    {products.map((product) => (
                      <TableRow
                        key={product.id}
                        className="cursor-pointer"
                        onClick={() =>
                          router.push(`/dashboard/products/${product.id}`)
                        }
                      >
                        <TableCell className="truncate">
                          {product.name}
                        </TableCell>
                        <TableCell className="truncate">
                          {product.latestRelease ? (
                            <Badge variant="primary">
                              <Rss className="mr-1 h-3 w-3" />
                              {product.latestRelease}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="truncate">
                          {product.totalReleases}
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={new Date(product.createdAt).toLocaleString(
                            locale,
                          )}
                        >
                          <DateConverter date={product.createdAt} />
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={new Date(product.updatedAt).toLocaleString(
                            locale,
                          )}
                        >
                          <DateConverter date={product.updatedAt} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'sticky right-0 w-[50px] truncate px-2 py-0 text-right',
                            {
                              'bg-background drop-shadow-md': showDropdown,
                            },
                          )}
                        >
                          <ProductsActionDropdown product={product} />
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
                totalItems={totalProducts}
                totalPages={Math.ceil(totalProducts / pageSize)}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex w-full max-w-xl flex-col items-center justify-center gap-4">
                <div className="flex">
                  <span className="rounded-lg bg-secondary p-4">
                    <Package className="h-6 w-6" />
                  </span>
                </div>
                <h3 className="text-lg font-bold">
                  {t('dashboard.products.add_your_first_product')}
                </h3>
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  {t('dashboard.products.product_description')}
                </p>
                <div>
                  <AddEntityButton entityType="product" displayText />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </ProductModalProvider>
  );
}
