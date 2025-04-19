'use client';
import {
  IBlacklistGetResponse,
  IBlacklistGetSuccessResponse,
} from '@/app/api/(dashboard)/blacklist/route';
import { DateConverter } from '@/components/shared/DateConverter';
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
import { BlacklistModalProvider } from '@/providers/BlacklistModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { BlacklistType } from '@lukittu/shared';
import {
  ArrowDownUp,
  Ban,
  Clock,
  Filter,
  Fingerprint,
  Globe,
  MapPinned,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { BlacklistActionDropdown } from './BlacklistActionDropdown';

const fetchBlacklists = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IBlacklistGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

const TypeBadge = ({ type }: { type: BlacklistType }) => {
  const t = useTranslations();

  const icon = {
    [BlacklistType.IP_ADDRESS]: <MapPinned className="mr-1 h-3 w-3" />,
    [BlacklistType.COUNTRY]: <Globe className="mr-1 h-3 w-3" />,
    [BlacklistType.DEVICE_IDENTIFIER]: <Fingerprint className="mr-1 h-3 w-3" />,
  };

  return (
    <Badge className="text-xs" variant="primary">
      {icon[type]}
      {t(`general.${type.toLowerCase()}` as any)}
    </Badge>
  );
};

export function BlacklistTable() {
  const locale = useLocale();
  const t = useTranslations();
  const { showDropdown, containerRef } = useTableScroll();
  const teamCtx = useContext(TeamContext);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [debounceSearch, setDebounceSearch] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortColumn, setSortColumn] = useState<
    'createdAt' | 'updatedAt' | null
  >(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
    null,
  );

  const searchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(sortColumn && { sortColumn }),
    ...(sortDirection && { sortDirection }),
    ...(search && { search }),
  });

  const { data, error, isLoading } = useSWR<IBlacklistGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/blacklist', teamCtx.selectedTeam, searchParams.toString()]
      : null,
    ([url, _, params]) => fetchBlacklists(`${url}?${params}`),
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(debounceSearch);
    }, 500);

    return () => {
      clearTimeout(timeout);
    };
  }, [debounceSearch]);

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const blacklist = data?.blacklist ?? [];
  const hasBlacklist = data?.hasResults ?? true;
  const totalBlacklist = data?.totalResults ?? 1;

  return (
    <BlacklistModalProvider>
      <MobileFilterModal
        filterOptions={[
          {
            type: 'search',
            key: 'search',
            placeholder: t('dashboard.blacklist.search_blacklist'),
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
            {t('dashboard.navigation.blacklist')}
            <div className="ml-auto flex gap-2">
              <Button
                className="lg:hidden"
                size="sm"
                variant="outline"
                onClick={() => setMobileFiltersOpen(true)}
              >
                <Filter className="h-4 w-4" />
              </Button>
              <AddEntityButton entityType="blacklist" />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasBlacklist && teamCtx.selectedTeam ? (
            <>
              <div className="relative mb-4 flex min-w-[33%] max-w-xs items-center max-lg:hidden">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 transform" />
                <Input
                  className="pl-8"
                  placeholder={t('dashboard.blacklist.search_blacklist')}
                  value={debounceSearch}
                  onChange={(e) => {
                    setDebounceSearch(e.target.value);
                  }}
                />
              </div>
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
                  : blacklist.map((blacklist) => (
                      <div
                        key={blacklist.id}
                        className="group relative flex items-center justify-between border-b py-3 first:border-t"
                        role="button"
                        tabIndex={0}
                      >
                        <div className="absolute inset-0 -mx-2 rounded-lg transition-colors group-hover:bg-secondary/80" />
                        <div className="z-10">
                          <span className="sm:hidden">
                            <TypeBadge type={blacklist.type} />
                          </span>
                          <p className="line-clamp-2 break-all font-medium">{`${blacklist.country ?? blacklist.value}`}</p>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <div className="text-sm font-semibold text-muted-foreground">
                                {new Date(blacklist.createdAt).toLocaleString(
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
                              <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                              <div className="text-sm text-muted-foreground">
                                {blacklist.hits}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="z-10 flex items-center space-x-2">
                          <span className="rounded-full px-2 py-1 text-xs font-medium max-sm:hidden">
                            <TypeBadge type={blacklist.type} />
                          </span>
                          <BlacklistActionDropdown blacklist={blacklist} />
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
                      {t('general.value')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.type')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.hits')}
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
                  <TableSkeleton columns={6} rows={6} />
                ) : (
                  <TableBody>
                    {blacklist.map((blacklist) => (
                      <TableRow key={blacklist.id}>
                        <TableCell className="truncate">
                          {blacklist.country ?? blacklist.value}
                        </TableCell>
                        <TableCell className="truncate">
                          <TypeBadge type={blacklist.type} />
                        </TableCell>
                        <TableCell className="truncate">
                          {blacklist.hits}
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={new Date(blacklist.updatedAt).toLocaleString(
                            locale,
                          )}
                        >
                          <DateConverter date={blacklist.updatedAt} />
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={new Date(blacklist.createdAt).toLocaleString(
                            locale,
                          )}
                        >
                          <DateConverter date={blacklist.createdAt} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'sticky right-0 w-[50px] truncate px-2 py-0 text-right',
                            {
                              'bg-background drop-shadow-md': showDropdown,
                            },
                          )}
                        >
                          <BlacklistActionDropdown blacklist={blacklist} />
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
                totalItems={totalBlacklist}
                totalPages={Math.ceil(totalBlacklist / pageSize)}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex w-full max-w-xl flex-col items-center justify-center gap-4">
                <div className="flex">
                  <span className="rounded-lg bg-secondary p-4">
                    <Ban className="h-6 w-6" />
                  </span>
                </div>
                <h3 className="text-lg font-bold">
                  {t('dashboard.blacklist.add_your_first_blacklist')}
                </h3>
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  {t('dashboard.blacklist.blacklist_description')}
                </p>
                <div>
                  <AddEntityButton entityType="blacklist" displayText />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </BlacklistModalProvider>
  );
}
