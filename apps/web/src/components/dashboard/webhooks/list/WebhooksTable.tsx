'use client';
import {
  IWebhookGetResponse,
  IWebhookGetSuccessResponse,
} from '@/app/api/(dashboard)/webhooks/route';
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
import { TeamContext } from '@/providers/TeamProvider';
import { WebhookModalProvider } from '@/providers/WebhookModalProvider';
import {
  ArrowDownUp,
  CheckCircle,
  Clock,
  Filter,
  Search,
  Webhook,
  XCircle,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { WebhooksActionDropdown } from '../../webhooks/WebhooksActionDropdown';

const fetchWebhooks = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IWebhookGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

const StatusBadge = ({ active, t }: { active: boolean; t: any }) => (
  <Badge className="text-xs" variant={active ? 'success' : 'error'}>
    {active ? (
      <CheckCircle className="mr-1 h-3 w-3" />
    ) : (
      <XCircle className="mr-1 h-3 w-3" />
    )}
    {active ? t('general.active') : t('general.inactive')}
  </Badge>
);

export function WebhooksTable() {
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
    'createdAt' | 'updatedAt' | 'name' | 'active' | null
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

  const { data, error, isLoading } = useSWR<IWebhookGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/webhooks', teamCtx.selectedTeam, searchParams.toString()]
      : null,
    ([url, _, params]) => fetchWebhooks(`${url}?${params}`),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const webhooks = data?.webhooks ?? [];
  const totalWebhooks = data?.totalResults ?? 0;
  const hasWebhooks = data?.hasResults ?? true;

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
          placeholder={t('dashboard.webhooks.search_webhook')}
          value={debounceSearch}
          onChange={(e) => {
            setDebounceSearch(e.target.value);
          }}
        />
      </div>

      {search && (
        <Button
          className="h-7 rounded-full text-xs"
          size="sm"
          onClick={() => {
            setDebounceSearch('');
            setSearch('');
          }}
        >
          {t('general.clear_all')}
        </Button>
      )}
    </div>
  );

  return (
    <WebhookModalProvider>
      <MobileFilterModal
        filterOptions={[
          {
            type: 'search',
            key: 'search',
            placeholder: t('dashboard.webhooks.search_webhook'),
          },
        ]}
        initialFilters={{
          search,
        }}
        open={mobileFiltersOpen}
        title={t('general.filters')}
        onApply={(filters) => {
          setSearch(filters.search);
        }}
        onOpenChange={setMobileFiltersOpen}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-xl font-bold">
            {t('dashboard.navigation.webhooks')}
            <div className="ml-auto flex gap-2">
              <Button
                className="lg:hidden"
                size="sm"
                variant="outline"
                onClick={() => setMobileFiltersOpen(true)}
              >
                <Filter className="h-4 w-4" />
              </Button>
              <AddEntityButton entityType="webhook" />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasWebhooks && teamCtx.selectedTeam ? (
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
                  : webhooks.map((webhook) => (
                      <Link
                        key={webhook.id}
                        className="group relative flex items-center justify-between border-b py-3 first:border-t"
                        href={`/dashboard/webhooks/${webhook.id}`}
                        tabIndex={0}
                      >
                        <div className="absolute inset-0 -mx-2 rounded-lg transition-colors group-hover:bg-secondary/80" />
                        <div className="z-10">
                          <span className="sm:hidden">
                            <StatusBadge active={webhook.active} t={t} />
                          </span>
                          <p className="line-clamp-1 break-all font-medium">
                            {webhook.name}
                          </p>
                          <p className="line-clamp-1 break-all text-sm text-muted-foreground">
                            {webhook.url}
                          </p>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <div className="text-sm font-semibold text-muted-foreground">
                                {new Date(webhook.createdAt).toLocaleString(
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
                        </div>
                        <div className="z-10 flex items-center space-x-2">
                          <span className="rounded-full px-2 py-1 text-xs font-medium max-sm:hidden">
                            <StatusBadge active={webhook.active} t={t} />
                          </span>
                          <WebhooksActionDropdown webhook={webhook} />
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
                      {t('general.url')}
                    </TableHead>
                    <TableHead className="truncate">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSortColumn('active');
                          setSortDirection(
                            sortColumn === 'active' && sortDirection === 'asc'
                              ? 'desc'
                              : 'asc',
                          );
                        }}
                      >
                        {t('general.status')}
                        <ArrowDownUp className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="truncate">Events</TableHead>
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
                  <TableSkeleton columns={7} rows={7} />
                ) : (
                  <TableBody>
                    {webhooks.map((webhook) => (
                      <TableRow
                        key={webhook.id}
                        className="cursor-pointer"
                        onClick={() =>
                          router.push(`/dashboard/webhooks/${webhook.id}`)
                        }
                      >
                        <TableCell className="truncate font-medium">
                          {webhook.name}
                        </TableCell>
                        <TableCell
                          className="max-w-xs truncate"
                          title={webhook.url}
                        >
                          {webhook.url}
                        </TableCell>
                        <TableCell className="truncate">
                          <StatusBadge active={webhook.active} t={t} />
                        </TableCell>
                        <TableCell className="truncate">
                          {webhook.enabledEvents.length > 0
                            ? `${webhook.enabledEvents.length} events`
                            : 'None'}
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={new Date(webhook.createdAt).toLocaleString(
                            locale,
                          )}
                        >
                          <DateConverter date={webhook.createdAt} />
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={new Date(webhook.updatedAt).toLocaleString(
                            locale,
                          )}
                        >
                          <DateConverter date={webhook.updatedAt} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'sticky right-0 w-[50px] truncate px-2 py-0 text-right',
                            {
                              'bg-background drop-shadow-md': showDropdown,
                            },
                          )}
                        >
                          <WebhooksActionDropdown webhook={webhook} />
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
                totalItems={totalWebhooks}
                totalPages={Math.ceil(totalWebhooks / pageSize)}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex w-full max-w-xl flex-col items-center justify-center gap-4">
                <div className="flex">
                  <span className="rounded-lg bg-secondary p-4">
                    <Webhook className="h-6 w-6" />
                  </span>
                </div>
                <h3 className="text-lg font-bold">
                  {t('dashboard.webhooks.add_your_first_webhook')}
                </h3>
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  {t('dashboard.webhooks.webhook_description')}
                </p>
                <div>
                  <AddEntityButton entityType="webhook" displayText />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </WebhookModalProvider>
  );
}
