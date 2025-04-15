'use client';
import { ILogsGetSuccessResponse } from '@/app/api/(dashboard)/logs/route';
import { DateConverter } from '@/components/shared/DateConverter';
import { CustomerFilterChip } from '@/components/shared/filtering/CustomerFilterChip';
import { DateRangeFilterChip } from '@/components/shared/filtering/DateRangeFilterChip';
import { IpFilterChip } from '@/components/shared/filtering/IpFilterChip';
import { LicenseFilterChip } from '@/components/shared/filtering/LicenseFilterChip';
import { ProductFilterChip } from '@/components/shared/filtering/ProductFilterChip';
import { StatusFilterChip } from '@/components/shared/filtering/StatusFilterChip';
import { TypeFilterChip } from '@/components/shared/filtering/TypeFilterChip';
import LoadingButton from '@/components/shared/LoadingButton';
import { CountryFlag } from '@/components/shared/misc/CountryFlag';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/tailwind-helpers';
import { TeamContext } from '@/providers/TeamProvider';
import { addDays } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  Copy,
  ExternalLink,
  Logs,
  XCircle,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import useSWRInfinite from 'swr/infinite';
import {
  LogViewerLeftSkeleton,
  LogViewerRightSkeleton,
} from './LogViewerSkeleton';

export default function LogViewer() {
  const t = useTranslations();
  const locale = useLocale();
  const teamCtx = useContext(TeamContext);
  const isFirstLoad = useRef(true);

  const [selectedLog, setSelectedLog] = useState<
    ILogsGetSuccessResponse['logs'][number] | null
  >(null);
  const [showDetails, setShowDetails] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [licenseSearch, setLicenseSearch] = useState('');
  const [ipSearch, setIpSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -7),
    to: new Date(),
  });

  const [tempStatus, setTempStatus] = useState(statusFilter);
  const [tempType, setTempType] = useState(typeFilter);
  const [tempDateRange, setTempDateRange] = useState(dateRange);
  const [tempLicenseSearch, setTempLicenseSearch] = useState(licenseSearch);
  const [tempIpSearch, setTempIpSearch] = useState(ipSearch);
  const [tempProductIds, setTempProductIds] = useState(productIds);
  const [tempCustomerIds, setTempCustomerIds] = useState(customerIds);

  const DEFAULT_STATUS = 'all';
  const DEFAULT_TYPE = 'all';
  const DEFAULT_DATE_RANGE = {
    from: addDays(new Date(), -7),
    to: new Date(),
  };
  const DEFAULT_SEARCH = '';
  const DEFAULT_IDS: string[] = [];

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'all') count++;
    if (typeFilter !== 'all') count++;
    if (customerIds.length > 0) count++;
    if (productIds.length > 0) count++;
    if (licenseSearch) count++;
    if (ipSearch) count++;
    if (dateRange?.from || dateRange?.to) count++;
    return count;
  }, [
    statusFilter,
    typeFilter,
    customerIds,
    productIds,
    licenseSearch,
    ipSearch,
    dateRange,
  ]);

  const getKey = (
    pageIndex: number,
    previousPageData: ILogsGetSuccessResponse | null,
  ) => {
    if (previousPageData && !previousPageData.logs.length) return null;
    if (!teamCtx.selectedTeam) return null;

    const params = new URLSearchParams({
      page: (pageIndex + 1).toString(),
      pageSize: '25',
      team: teamCtx.selectedTeam,
    });

    if (statusFilter !== 'all') {
      params.append('status', statusFilter);
    }
    if (typeFilter !== 'all') {
      params.append('type', typeFilter);
    }
    if (customerIds.length > 0) {
      params.append('customerIds', customerIds.join(','));
    }
    if (productIds.length > 0) {
      params.append('productIds', productIds.join(','));
    }
    if (licenseSearch) {
      params.append('licenseSearch', licenseSearch);
    }
    if (ipSearch) {
      params.append('ipSearch', ipSearch);
    }
    if (dateRange?.from) {
      const dateRangeStartOfDay = new Date(dateRange.from);
      dateRangeStartOfDay.setHours(0, 0, 0, 0);
      params.append('rangeStart', dateRangeStartOfDay.toISOString());
    }
    if (dateRange?.to) {
      const dateRangeEndOfDay = new Date(dateRange.to);
      dateRangeEndOfDay.setHours(23, 59, 59, 999);
      params.append('rangeEnd', dateRangeEndOfDay.toISOString());
    }

    return `/api/logs?${params.toString()}`;
  };

  const { data, error, size, setSize, isLoading } =
    useSWRInfinite<ILogsGetSuccessResponse>(
      getKey,
      async (url) => {
        const response = await fetch(url);
        const data = await response.json();
        if ('message' in data) {
          throw new Error(data.message);
        }
        return data;
      },
      {
        refreshInterval: 30 * 1000, // 30 seconds
      },
    );

  const logs = useMemo(() => {
    if (!data) return [];

    const flattenedLogs = data.flatMap((page) => page.logs);
    const uniqueLogs = Array.from(
      new Map(flattenedLogs.map((log) => [log.id, log])).values(),
    );

    return Object.values(
      uniqueLogs.reduce(
        (acc, log) => {
          const date = new Date(log.createdAt).toDateString();
          acc[date] = acc[date] ?? [];
          acc[date].push(log);
          return acc;
        },
        {} as Record<string, ILogsGetSuccessResponse['logs']>,
      ),
    );
  }, [data]);

  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === 'undefined');
  const hasMore = data ? data[0]?.totalResults > logs.flat().length : false;

  useEffect(() => {
    if (!selectedLog && logs.length > 0) {
      setSelectedLog(logs[0][0]);
    }
  }, [logs, selectedLog]);

  const handleLogClick = (log: ILogsGetSuccessResponse['logs'][number]) => {
    setSelectedLog(log);
    setShowDetails(true);
  };

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    setSelectedLog(null);
    setShowDetails(false);
    setSize(1);
  }, [
    teamCtx.selectedTeam,
    setSize,
    statusFilter,
    typeFilter,
    customerIds,
    productIds,
    licenseSearch,
    ipSearch,
    dateRange,
  ]);

  const handleResetToDefault = () => {
    setStatusFilter(DEFAULT_STATUS);
    setTempStatus(DEFAULT_STATUS);
    setTypeFilter(DEFAULT_TYPE);
    setTempType(DEFAULT_TYPE);
    setCustomerIds(DEFAULT_IDS);
    setTempCustomerIds(DEFAULT_IDS);
    setProductIds(DEFAULT_IDS);
    setTempProductIds(DEFAULT_IDS);
    setLicenseSearch(DEFAULT_SEARCH);
    setTempLicenseSearch(DEFAULT_SEARCH);
    setIpSearch(DEFAULT_SEARCH);
    setTempIpSearch(DEFAULT_SEARCH);
    setDateRange(DEFAULT_DATE_RANGE);
    setTempDateRange(DEFAULT_DATE_RANGE);
  };

  const renderFilterChips = () => (
    <div className="flex flex-wrap items-center gap-2">
      <StatusFilterChip
        setStatus={setStatusFilter}
        setTempStatus={setTempStatus}
        status={statusFilter}
        tempStatus={tempStatus}
      />

      <DateRangeFilterChip
        dateRange={dateRange}
        setDateRange={setDateRange}
        setTempDateRange={setTempDateRange}
        tempDateRange={tempDateRange}
      />

      <LicenseFilterChip
        licenseSearch={licenseSearch}
        setLicenseSearch={setLicenseSearch}
        setTempLicenseSearch={setTempLicenseSearch}
        tempLicenseSearch={tempLicenseSearch}
      />

      <IpFilterChip
        ipSearch={ipSearch}
        setIpSearch={setIpSearch}
        setTempIpSearch={setTempIpSearch}
        tempIpSearch={tempIpSearch}
      />

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

      <TypeFilterChip
        setTempType={setTempType}
        setType={setTypeFilter}
        tempType={tempType}
        type={typeFilter}
      />

      <div className="flex gap-2">
        <Button
          className="h-7 rounded-full text-xs"
          size="sm"
          onClick={handleResetToDefault}
        >
          {t('general.reset_filters')}
        </Button>
        {activeFiltersCount > 0 && (
          <Button
            className="h-7 rounded-full text-xs"
            size="sm"
            onClick={() => {
              setStatusFilter(DEFAULT_STATUS);
              setTempStatus(DEFAULT_STATUS);
              setTypeFilter(DEFAULT_TYPE);
              setTempType(DEFAULT_TYPE);
              setCustomerIds(DEFAULT_IDS);
              setTempCustomerIds(DEFAULT_IDS);
              setProductIds(DEFAULT_IDS);
              setTempProductIds(DEFAULT_IDS);
              setLicenseSearch(DEFAULT_SEARCH);
              setTempLicenseSearch(DEFAULT_SEARCH);
              setIpSearch(DEFAULT_SEARCH);
              setTempIpSearch(DEFAULT_SEARCH);
              setDateRange(undefined);
              setTempDateRange(undefined);
            }}
          >
            {t('general.clear_all')}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Card className="flex flex-col">
        <CardHeader className="px-0 pb-0">
          <div className="border-b px-6 pb-4 max-md:px-0">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">
                {t('dashboard.navigation.logs')}
              </h2>
            </div>
            {renderFilterChips()}
          </div>
        </CardHeader>

        <div className="flex flex-col md:flex-row">
          {((data?.[0]?.totalResults || 0) > 0 || isLoading) &&
          teamCtx.selectedTeam ? (
            <>
              <div
                className={`w-full border-r p-2 md:w-1/2 ${showDetails ? 'hidden md:block' : 'block'}`}
              >
                <div className="p-4">
                  {isLoading && size === 1 ? (
                    <LogViewerLeftSkeleton />
                  ) : (
                    logs.map((log, index) => (
                      <div
                        key={index}
                        className={cn('mb-4', {
                          'mb-0': index === logs.length - 1,
                        })}
                      >
                        <h3 className="mb-2 text-sm font-normal text-muted-foreground">
                          {new Date(log[0].createdAt).toLocaleDateString(
                            locale,
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            },
                          )}
                        </h3>
                        <Separator className="mb-2" />
                        <div className="grid grid-cols-1">
                          {log.map((l, indexInner) => (
                            <div
                              key={`${index}-${indexInner}`}
                              className="group relative mb-2"
                            >
                              <div className="absolute inset-0 -mx-2 rounded-lg transition-colors group-hover:bg-secondary/80 md:hidden" />
                              <Button
                                className={cn(
                                  'relative z-10 w-full justify-start gap-2 text-left max-md:px-0 max-md:hover:bg-inherit',
                                  {
                                    'md:bg-muted': selectedLog?.id === l.id,
                                  },
                                )}
                                variant="ghost"
                                onClick={() => handleLogClick(l)}
                              >
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge
                                        className="mr-2 flex w-full max-w-fit shrink-[1] truncate max-sm:hidden"
                                        variant={
                                          l.statusCode >= 200 &&
                                          l.statusCode < 300
                                            ? 'success'
                                            : l.statusCode === 500
                                              ? 'error'
                                              : 'warning'
                                        }
                                      >
                                        {l.statusCode >= 200 &&
                                        l.statusCode < 300 ? (
                                          <CheckCircle className="mr-1 h-3 w-3 flex-shrink-0" />
                                        ) : l.statusCode === 500 ? (
                                          <XCircle className="mr-1 h-3 w-3 flex-shrink-0" />
                                        ) : (
                                          <AlertTriangle className="mr-1 h-3 w-3 flex-shrink-0" />
                                        )}
                                        <span className="truncate">
                                          {l.status}
                                        </span>
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="flex items-center gap-1">
                                        {l.statusCode >= 200 &&
                                        l.statusCode < 300 ? (
                                          <CheckCircle className="h-3 w-3 flex-shrink-0 text-[#22c55e]" />
                                        ) : l.statusCode === 500 ? (
                                          <XCircle className="h-3 w-3 flex-shrink-0 text-red-500" />
                                        ) : (
                                          <AlertTriangle className="h-3 w-3 flex-shrink-0 text-yellow-500" />
                                        )}
                                        <p>{l.status}</p>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <span className="hidden max-sm:block">
                                  {l.statusCode >= 200 && l.statusCode < 300 ? (
                                    <CheckCircle className="mr-1 h-3 w-3 text-[#237f26] dark:text-green-400" />
                                  ) : l.statusCode === 500 ? (
                                    <XCircle className="mr-1 h-3 w-3 text-red-500 dark:text-red-400" />
                                  ) : (
                                    <AlertTriangle className="mr-1 h-3 w-3 text-yellow-600 dark:text-yellow-400" />
                                  )}
                                </span>
                                <span className="mr-2">{l.method}</span>
                                <span className="shrink-[2] truncate text-muted-foreground">
                                  {l.path}
                                </span>
                                <DateConverter
                                  date={l.createdAt}
                                  displayType="time"
                                />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                  <LoadingButton
                    disabled={!hasMore || !teamCtx.selectedTeam}
                    pending={isLoadingMore}
                    variant="link"
                    onClick={() => setSize(size + 1)}
                  >
                    {t('general.load_more')}
                  </LoadingButton>
                </div>
              </div>
              <div
                className={`w-full p-2 md:w-1/2 ${
                  showDetails ? 'block' : 'hidden md:block'
                }`}
              >
                {isLoading && size === 1 ? (
                  <LogViewerRightSkeleton />
                ) : selectedLog ? (
                  <div className="p-4">
                    <div className="mb-4 flex items-center">
                      <Button
                        className="mr-2 md:hidden"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowDetails(false)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <h2
                        className="flex-grow truncate text-lg font-semibold tracking-tight md:mt-1"
                        title={`${selectedLog.method} ${selectedLog.path}`}
                      >
                        {selectedLog.method} {selectedLog.path}
                      </h2>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {t('general.code')}
                        </p>
                        <Badge
                          className="max-w-full text-xs"
                          variant={
                            selectedLog.statusCode >= 200 &&
                            selectedLog.statusCode < 300
                              ? 'success'
                              : selectedLog.statusCode === 500
                                ? 'error'
                                : 'warning'
                          }
                        >
                          {selectedLog.statusCode >= 200 &&
                          selectedLog.statusCode < 300 ? (
                            <CheckCircle className="mr-1 h-3 w-3" />
                          ) : selectedLog.statusCode === 500 ? (
                            <XCircle className="mr-1 h-3 w-3" />
                          ) : (
                            <AlertTriangle className="mr-1 h-3 w-3" />
                          )}
                          <span className="truncate">{selectedLog.status}</span>
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">ID</p>
                        <div className="text-sm">
                          <span className="flex items-center gap-2">
                            <Copy className="h-4 w-4 shrink-0" />
                            <TooltipProvider>
                              <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                  <span
                                    className="truncate text-primary hover:underline"
                                    role="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(
                                        selectedLog.id,
                                      );
                                      toast.success(
                                        t('general.copied_to_clipboard'),
                                      );
                                    }}
                                  >
                                    {selectedLog.id}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t('general.click_to_copy')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {t('general.created_at')}
                        </p>
                        <div className="text-sm">
                          <DateConverter date={selectedLog.createdAt} />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {t('general.ip_address')}
                        </p>
                        <div className="flex items-center gap-2 truncate text-sm">
                          {selectedLog.alpha2 && (
                            <CountryFlag
                              countryCode={selectedLog.alpha2}
                              countryName={selectedLog.country}
                            />
                          )}
                          {selectedLog.ipAddress ?? t('general.unknown')}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {t('general.device')}
                        </p>
                        <p className="text-sm">
                          {selectedLog.browser || selectedLog.os
                            ? `${selectedLog.browser ?? t('general.unknown')} ${
                                selectedLog.os ? `(${selectedLog.os})` : ''
                              }`
                            : t('general.unknown')}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {t('general.origin')}
                        </p>
                        <p className="text-sm">
                          {selectedLog.origin ?? t('general.unknown')}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {t('dashboard.licenses.status')}
                        </p>
                        <p className="text-sm">{selectedLog.statusCode}</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <Button className="p-0" variant="link" asChild>
                        {!selectedLog.licenseId ? (
                          <Button
                            className="flex items-center gap-2"
                            variant="link"
                            disabled
                          >
                            {t('general.license')}
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Link
                            className="flex items-center gap-2"
                            href={`/dashboard/licenses/${selectedLog.licenseId}`}
                          >
                            {t('general.license')}
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        )}
                      </Button>
                    </div>
                    <Separator className="my-4" />
                    {selectedLog.method === 'GET' && (
                      <>
                        <h3 className="mb-2 font-semibold">
                          {t('dashboard.logs.query_params')}
                        </h3>
                        <pre className="overflow-x-auto rounded-md bg-muted p-4">
                          <code>
                            {JSON.stringify(selectedLog.requestQuery, null, 2)}
                          </code>
                        </pre>
                      </>
                    )}
                    {selectedLog.method === 'POST' && (
                      <>
                        <h3 className="mb-2 font-semibold">
                          {t('dashboard.logs.request_body')}
                        </h3>
                        <pre className="overflow-x-auto rounded-md bg-muted p-4">
                          <code>
                            {JSON.stringify(selectedLog.requestBody, null, 2)}
                          </code>
                        </pre>
                      </>
                    )}
                    <h3 className="mb-2 mt-4 font-semibold">
                      {t('dashboard.logs.response_body')}
                    </h3>
                    <pre className="overflow-x-auto rounded-md bg-muted p-4">
                      <code>
                        {JSON.stringify(selectedLog.responseBody, null, 2)}
                      </code>
                    </pre>
                  </div>
                ) : (
                  <div className="p-4 text-center text-muted-foreground">
                    {t('dashboard.logs.select_log')}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="w-full">
              <h2 className="my-1 p-6 text-xl font-bold tracking-tight">
                {t('dashboard.navigation.logs')}
              </h2>
              <div className="flex w-full flex-col items-center justify-center p-6 pt-0">
                <div className="flex w-full max-w-xl flex-col items-center justify-center gap-4 py-20">
                  <div className="flex">
                    <span className="rounded-lg bg-secondary p-4">
                      <Logs className="h-6 w-6" />
                    </span>
                  </div>
                  <h3 className="text-lg font-bold">
                    {t('dashboard.logs.no_logs_title')}
                  </h3>
                  <p className="max-w-sm text-center text-sm text-muted-foreground">
                    {t('dashboard.logs.no_logs_description')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
