'use client';
import builtByBitLogo from '@/../public/integrations/builtbybit_square.png';
import discordLogo from '@/../public/integrations/discord_square.jpg';
import polymartLogo from '@/../public/integrations/polymart.png';
import stripeLogo from '@/../public/integrations/stripe_square.jpeg';
import {
  IAuditLogsGetResponse,
  IAuditLogsGetSuccessResponse,
} from '@/app/api/(dashboard)/audit-logs/route';
import { DateConverter } from '@/components/shared/DateConverter';
import { DateRangeFilterChip } from '@/components/shared/filtering/DateRangeFilterChip';
import { IpFilterChip } from '@/components/shared/filtering/IpFilterChip';
import { SourceFilterChip } from '@/components/shared/filtering/SourceFilterChip';
import { TargetFilterChip } from '@/components/shared/filtering/TargetFilterChip';
import { CountryFlag } from '@/components/shared/misc/CountryFlag';
import TablePagination from '@/components/shared/table/TablePagination';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getBrowserName,
  getSourceAvatarColor,
  getSourceBadgeVariant,
  getSourceDisplayName,
} from '@/lib/utils/audit-helpers';
import { parseAsLocalDate } from '@/lib/utils/date-helpers';
import { getInitials } from '@/lib/utils/text-helpers';
import { TeamContext } from '@/providers/TeamProvider';
import { AuditLogSource } from '@lukittu/shared';
import { addDays } from 'date-fns';
import {
  ArrowDownUp,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Logs,
  MapPinOff,
  User,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import useSWR from 'swr';
import AuditLogRequestModal from './AuditLogRequestModal';

const fetchAuditLogs = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IAuditLogsGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

const AuditLogMapPreview = dynamic(() => import('./AuditLogMapPreview'), {
  ssr: false,
});

const ExpandedContent = React.memo(
  ({
    auditLog,
    setSelectedAuditLog,
    setAuditLogModalOpen,
  }: {
    auditLog: IAuditLogsGetSuccessResponse['auditLogs'][number];
    setSelectedAuditLog: (
      log: IAuditLogsGetSuccessResponse['auditLogs'][number],
    ) => void;
    setAuditLogModalOpen: (open: boolean) => void;
  }) => {
    const t = useTranslations();

    return (
      <div className="rounded-md p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid gap-3">
            <div className="grid grid-cols-[180px,1fr] items-center gap-2 max-sm:grid-cols-1 max-sm:gap-0">
              <h3 className="text-sm font-semibold">{t('general.user')}</h3>
              <p className="truncate text-sm text-muted-foreground">
                {auditLog.user?.email}
              </p>
            </div>
            <div className="grid grid-cols-[180px,1fr] items-center gap-2 max-sm:grid-cols-1 max-sm:gap-0">
              <h3 className="text-sm font-semibold">
                {t('general.ip_address')}
              </h3>
              <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                {auditLog.alpha2 && (
                  <CountryFlag
                    countryCode={auditLog.alpha2}
                    countryName={auditLog.country}
                  />
                )}
                {auditLog.ipAddress ?? t('general.unknown')}
              </p>
            </div>
            <div className="grid grid-cols-[180px,1fr] items-center gap-2 max-sm:grid-cols-1 max-sm:gap-0">
              <h3 className="text-sm font-semibold">{t('general.browser')}</h3>
              <p className="truncate text-sm text-muted-foreground">
                {auditLog.browser ?? t('general.unknown')}
              </p>
            </div>
            <div className="grid grid-cols-[180px,1fr] items-center gap-2 max-sm:grid-cols-1 max-sm:gap-0">
              <h3 className="text-sm font-semibold">
                {t('general.operating_system')}
              </h3>
              <p className="truncate text-sm text-muted-foreground">
                {auditLog.os ?? t('general.unknown')}
              </p>
            </div>
            <div className="grid grid-cols-[180px,1fr] items-center gap-2 max-sm:grid-cols-1 max-sm:gap-0">
              <h3 className="text-sm font-semibold">{t('general.device')}</h3>
              <p className="truncate text-sm text-muted-foreground">
                {auditLog.device ?? t('general.unknown')}
              </p>
            </div>
            {['CUSTOMER', 'LICENSE', 'PRODUCT'].includes(
              auditLog.targetType,
            ) && (
              <div className="grid grid-cols-[180px,1fr] items-center gap-2 max-sm:grid-cols-1 max-sm:gap-0">
                <h3 className="text-sm font-semibold">
                  {t(`general.${auditLog.targetType.toLowerCase()}` as any)}
                </h3>
                <Link
                  className="truncate text-sm font-semibold text-primary hover:underline"
                  href={`/dashboard/${auditLog.targetType.toLowerCase()}s/${auditLog.targetId}`}
                  title={auditLog.targetId}
                >
                  {auditLog.targetId}
                </Link>
              </div>
            )}
            <div>
              <Button
                className="mt-3"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSelectedAuditLog(auditLog);
                  setAuditLogModalOpen(true);
                }}
              >
                {t('dashboard.audit_logs.show_request')}
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid rounded-lg bg-muted max-md:min-h-80">
            {auditLog.latitude && auditLog.longitude ? (
              <AuditLogMapPreview
                latitude={auditLog.latitude}
                longitude={auditLog.longitude}
              />
            ) : (
              <div className="flex items-center justify-center rounded-lg border-2 border-dashed">
                <MapPinOff className="h-16 w-16 text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

ExpandedContent.displayName = 'ExpandedContent';

const getSourceLogoOrIcon = (source: string) => {
  switch (source) {
    case AuditLogSource.API_KEY:
      return <Bot className="h-full w-full p-1" />;
    case AuditLogSource.DASHBOARD:
      return <User className="h-full w-full" />;
    default:
      return null; // Will use image for integrations
  }
};

const getIntegrationLogoSrc = (source: string) => {
  switch (source) {
    case AuditLogSource.STRIPE_INTEGRATION:
      return stripeLogo;
    case AuditLogSource.DISCORD_INTEGRATION:
      return discordLogo;
    case AuditLogSource.BUILT_BY_BIT_INTEGRATION:
      return builtByBitLogo;
    case AuditLogSource.POLYMART_INTEGRATION:
      return polymartLogo;
    default:
      return null;
  }
};

export default function AuditLogTable() {
  const teamCtx = useContext(TeamContext);
  const t = useTranslations();
  const locale = useLocale();
  const isFirstLoad = useRef(true);

  const selectedTeam = teamCtx.teams.find(
    (team) => team.id === teamCtx.selectedTeam,
  );

  const [auditLogModalOpen, setAuditLogModalOpen] = useState(false);
  const [selectedAuditLog, setSelectedAuditLog] = useState<
    IAuditLogsGetSuccessResponse['auditLogs'][number] | null
  >(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useQueryState(
    'pageSize',
    parseAsInteger.withDefault(25),
  );
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1));
  const [sortColumn, setSortColumn] = useQueryState(
    'sortColumn',
    parseAsString.withDefault(''),
  );
  const [sortDirection, setSortDirection] = useQueryState(
    'sortDirection',
    parseAsString.withDefault(''),
  );
  const [animatingRows, setAnimatingRows] = useState<Set<string>>(new Set());

  const [sourceFilter, setSourceFilter] = useQueryState(
    'source',
    parseAsString.withDefault('all'),
  );
  const [targetTypeFilter, setTargetTypeFilter] = useQueryState(
    'targetType',
    parseAsString.withDefault('all'),
  );
  const [ipSearch, setIpSearch] = useQueryState(
    'ipSearch',
    parseAsString.withDefault(''),
  );
  const [dateRangeFrom, setDateRangeFrom] = useQueryState(
    'dateRangeFrom',
    parseAsLocalDate,
  );
  const [dateRangeTo, setDateRangeTo] = useQueryState(
    'dateRangeTo',
    parseAsLocalDate,
  );

  const dateRange = useMemo(
    () => ({
      from: dateRangeFrom || undefined,
      to: dateRangeTo || undefined,
    }),
    [dateRangeFrom, dateRangeTo],
  );

  const [tempSourceFilter, setTempSourceFilter] = useState(sourceFilter);
  const [tempTargetTypeFilter, setTempTargetTypeFilter] =
    useState(targetTypeFilter);
  const [tempIpSearch, setTempIpSearch] = useState(ipSearch);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(
    dateRange.from || dateRange.to
      ? dateRange
      : { from: addDays(new Date(), -7), to: new Date() },
  );

  const DEFAULT_FILTER = 'all';
  const DEFAULT_SEARCH = '';
  const DEFAULT_DATE_RANGE_FROM = useMemo(() => addDays(new Date(), -7), []);
  const DEFAULT_DATE_RANGE_TO = useMemo(() => new Date(), []);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (sourceFilter !== 'all') count++;
    if (targetTypeFilter !== 'all') count++;
    if (ipSearch) count++;
    if (dateRange?.from || dateRange?.to) count++;
    return count;
  }, [sourceFilter, targetTypeFilter, ipSearch, dateRange]);

  const handleResetToDefault = () => {
    setSourceFilter(DEFAULT_FILTER);
    setTempSourceFilter(DEFAULT_FILTER);
    setTargetTypeFilter(DEFAULT_FILTER);
    setTempTargetTypeFilter(DEFAULT_FILTER);
    setIpSearch(DEFAULT_SEARCH);
    setTempIpSearch(DEFAULT_SEARCH);
    setDateRangeFrom(DEFAULT_DATE_RANGE_FROM);
    setDateRangeTo(DEFAULT_DATE_RANGE_TO);
    setTempDateRange({
      from: DEFAULT_DATE_RANGE_FROM,
      to: DEFAULT_DATE_RANGE_TO,
    });
  };

  const searchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(sortColumn && sortColumn !== '' && { sortColumn }),
    ...(sortDirection && sortDirection !== '' && { sortDirection }),
  });

  if (sourceFilter !== 'all') {
    searchParams.append('source', sourceFilter);
  }
  if (targetTypeFilter !== 'all') {
    searchParams.append('targetType', targetTypeFilter);
  }
  if (ipSearch) {
    searchParams.append('ipSearch', ipSearch);
  }
  if (dateRange?.from) {
    const dateRangeStartOfDay = new Date(dateRange.from);
    dateRangeStartOfDay.setHours(0, 0, 0, 0);
    searchParams.append('rangeStart', dateRangeStartOfDay.toISOString());
  }
  if (dateRange?.to) {
    const dateRangeEndOfDay = new Date(dateRange.to);
    dateRangeEndOfDay.setHours(23, 59, 59, 999);
    searchParams.append('rangeEnd', dateRangeEndOfDay.toISOString());
  }

  const { data, error, isLoading } = useSWR<IAuditLogsGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/audit-logs', teamCtx.selectedTeam, searchParams.toString()]
      : null,
    ([url, _, params]) => fetchAuditLogs(`${url}?${params}`),
    {
      refreshInterval: 30 * 1000, // 30 seconds
    },
  );

  useEffect(() => {
    if (isFirstLoad.current) {
      if (!dateRange.from && !dateRange.to) {
        setDateRangeFrom(DEFAULT_DATE_RANGE_FROM);
        setDateRangeTo(DEFAULT_DATE_RANGE_TO);
      }
      isFirstLoad.current = false;
      return;
    }
    setPage(1);
  }, [
    setPage,
    teamCtx.selectedTeam,
    sourceFilter,
    targetTypeFilter,
    ipSearch,
    dateRange,
    setDateRangeFrom,
    setDateRangeTo,
    DEFAULT_DATE_RANGE_FROM,
    DEFAULT_DATE_RANGE_TO,
  ]);

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const auditLogs = data?.auditLogs ?? [];
  const totalAuditLogs = data?.totalResults ?? 1;

  const toggleRow = (id: string) => {
    const newExpandedRows = new Set(expandedRows);
    const newAnimatingRows = new Set(animatingRows);

    if (newExpandedRows.has(id)) {
      newExpandedRows.delete(id);
      newAnimatingRows.add(id);

      setTimeout(() => {
        setAnimatingRows((prev) => {
          const updated = new Set(prev);
          updated.delete(id);
          return updated;
        });
      }, 500);
    } else {
      newExpandedRows.add(id);
      newAnimatingRows.add(id);
    }

    setExpandedRows(newExpandedRows);
    setAnimatingRows(newAnimatingRows);
  };

  const handleResetAllFilters = () => {
    setSourceFilter(DEFAULT_FILTER);
    setTempSourceFilter(DEFAULT_FILTER);
    setTargetTypeFilter(DEFAULT_FILTER);
    setTempTargetTypeFilter(DEFAULT_FILTER);
    setIpSearch(DEFAULT_SEARCH);
    setTempIpSearch(DEFAULT_SEARCH);
    setDateRangeFrom(null);
    setDateRangeTo(null);
    setTempDateRange(undefined);
  };

  const renderFilterChips = () => (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SourceFilterChip
        setSource={setSourceFilter}
        setTempSource={setTempSourceFilter}
        source={sourceFilter as AuditLogSource | 'all'}
        tempSource={tempSourceFilter as AuditLogSource | 'all'}
      />

      <TargetFilterChip
        setTargetType={setTargetTypeFilter}
        setTempTargetType={setTempTargetTypeFilter}
        targetType={targetTypeFilter}
        tempTargetType={tempTargetTypeFilter}
      />

      <DateRangeFilterChip
        dateRange={dateRange}
        retentionDays={selectedTeam?.limits?.logRetention || 30}
        setDateRange={(range) => {
          setDateRangeFrom(range?.from || null);
          setDateRangeTo(range?.to || null);
        }}
        setTempDateRange={setTempDateRange}
        tempDateRange={tempDateRange}
      />

      <IpFilterChip
        ipSearch={ipSearch}
        setIpSearch={setIpSearch}
        setTempIpSearch={setTempIpSearch}
        tempIpSearch={tempIpSearch}
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
            onClick={handleResetAllFilters}
          >
            {t('general.clear_all')}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <AuditLogRequestModal
        auditLog={selectedAuditLog}
        open={auditLogModalOpen}
        onOpenChange={setAuditLogModalOpen}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-xl font-bold">
            {t('dashboard.navigation.audit_logs')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filter chips section */}
          {renderFilterChips()}

          {totalAuditLogs && teamCtx.selectedTeam ? (
            <>
              <style jsx>{`
                .expanded-content {
                  max-height: 0;
                  overflow: hidden;
                  transition:
                    max-height 0.3s ease-out,
                    opacity 0.3s ease-out;
                  opacity: 0;
                }
                .expanded-content.open {
                  max-height: 850px;
                  opacity: 1;
                  transition:
                    max-height 0.5s ease-in,
                    opacity 0.3s ease-in;
                }
              `}</style>
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
                  : auditLogs.map((auditLog) => (
                      <div
                        key={auditLog.id}
                        className="relative border-b py-3 first:border-t"
                        role="button"
                        onClick={() => toggleRow(auditLog.id)}
                      >
                        <div className="group relative flex items-center justify-between">
                          <div className="absolute inset-0 -mx-2 -my-3 rounded-lg transition-colors group-hover:bg-secondary/80 md:hidden" />
                          <div className="z-10 grid grid-cols-[auto,1fr,auto] items-center gap-4">
                            <Avatar
                              className={`h-12 w-12 border ${auditLog.source === AuditLogSource.DASHBOARD || (auditLog.source === AuditLogSource.DISCORD_INTEGRATION && auditLog.user) ? '' : 'p-0'}`}
                            >
                              {auditLog.source === AuditLogSource.DASHBOARD ||
                              (auditLog.source ===
                                AuditLogSource.DISCORD_INTEGRATION &&
                                auditLog.user) ? (
                                <>
                                  <AvatarImage
                                    src={auditLog.user?.imageUrl || undefined}
                                    asChild
                                  >
                                    {auditLog.user?.imageUrl && (
                                      <Image
                                        alt="Avatar"
                                        src={auditLog.user.imageUrl}
                                        fill
                                      />
                                    )}
                                  </AvatarImage>
                                  <AvatarFallback className="bg-primary text-xs text-white">
                                    {getInitials(
                                      auditLog.user?.fullName ?? '??',
                                    )}
                                  </AvatarFallback>
                                </>
                              ) : getIntegrationLogoSrc(auditLog.source) ? (
                                <Image
                                  alt={getSourceDisplayName(auditLog.source, t)}
                                  className="rounded-full object-cover"
                                  src={getIntegrationLogoSrc(auditLog.source)!}
                                  fill
                                />
                              ) : (
                                <AvatarFallback
                                  className={`${getSourceAvatarColor(auditLog.source)} text-xs text-white`}
                                >
                                  {getSourceLogoOrIcon(auditLog.source)}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <div className="overflow-hidden">
                              <p className="truncate font-medium">
                                {auditLog.source === AuditLogSource.DASHBOARD
                                  ? auditLog.user?.email
                                  : auditLog.source ===
                                        AuditLogSource.DISCORD_INTEGRATION &&
                                      auditLog.user
                                    ? auditLog.user?.email
                                    : getSourceDisplayName(auditLog.source, t)}
                              </p>
                              <div className="flex items-center gap-1">
                                <div className="truncate text-sm font-semibold text-muted-foreground">
                                  {t(
                                    `dashboard.audit_logs.actions_types.${auditLog.action.toLowerCase()}` as any,
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                <div className="text-sm font-semibold text-muted-foreground">
                                  {new Date(auditLog.createdAt).toLocaleString(
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
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleRow(auditLog.id)}
                            >
                              <ChevronDown
                                className={`h-4 w-4 ${
                                  expandedRows.has(auditLog.id)
                                    ? 'rotate-180 transform'
                                    : ''
                                }`}
                              />
                            </Button>
                          </div>
                        </div>
                        <div
                          className={`expanded-content ${expandedRows.has(auditLog.id) ? 'open z-20' : ''}`}
                        >
                          {(expandedRows.has(auditLog.id) ||
                            animatingRows.has(auditLog.id)) && (
                            <ExpandedContent
                              auditLog={auditLog}
                              setAuditLogModalOpen={setAuditLogModalOpen}
                              setSelectedAuditLog={setSelectedAuditLog}
                            />
                          )}
                        </div>
                      </div>
                    ))}
              </div>
              <Table className="max-md:hidden">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px] truncate" />
                    <TableHead className="truncate">
                      {t('general.action')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.source')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.target')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.browser')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.ip_address')}
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
                  </TableRow>
                </TableHeader>
                {isLoading ? (
                  <TableSkeleton columns={7} rows={7} />
                ) : (
                  <TableBody>
                    {auditLogs.map((auditLog) => (
                      <React.Fragment key={auditLog.id}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => toggleRow(auditLog.id)}
                        >
                          <TableCell className="truncate py-0 pr-0">
                            <Button size="sm" variant="ghost">
                              {expandedRows.has(auditLog.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="flex items-center gap-2 truncate">
                            <Avatar
                              className={`h-8 w-8 border ${auditLog.source === AuditLogSource.DASHBOARD || (auditLog.source === AuditLogSource.DISCORD_INTEGRATION && auditLog.user) ? '' : 'p-0'}`}
                            >
                              {auditLog.source === AuditLogSource.DASHBOARD ||
                              (auditLog.source ===
                                AuditLogSource.DISCORD_INTEGRATION &&
                                auditLog.user) ? (
                                <>
                                  <AvatarImage
                                    src={auditLog.user?.imageUrl || undefined}
                                    asChild
                                  >
                                    {auditLog.user?.imageUrl && (
                                      <Image
                                        alt="Avatar"
                                        src={auditLog.user.imageUrl}
                                        fill
                                      />
                                    )}
                                  </AvatarImage>
                                  <AvatarFallback className="bg-primary text-xs text-white">
                                    {getInitials(
                                      auditLog.user?.fullName ?? '??',
                                    )}
                                  </AvatarFallback>
                                </>
                              ) : getIntegrationLogoSrc(auditLog.source) ? (
                                <Image
                                  alt={getSourceDisplayName(auditLog.source, t)}
                                  className="rounded-full object-cover"
                                  src={getIntegrationLogoSrc(auditLog.source)!}
                                  fill
                                />
                              ) : (
                                <AvatarFallback
                                  className={`${getSourceAvatarColor(auditLog.source)} text-xs text-white`}
                                >
                                  {getSourceLogoOrIcon(auditLog.source)}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <span>
                              <b>
                                {auditLog.source === AuditLogSource.DASHBOARD
                                  ? (auditLog.user?.email ??
                                    t('general.unknown'))
                                  : auditLog.source ===
                                        AuditLogSource.DISCORD_INTEGRATION &&
                                      auditLog.user
                                    ? auditLog.user?.email
                                    : getSourceDisplayName(auditLog.source, t)}
                              </b>{' '}
                              {t(
                                `dashboard.audit_logs.actions_types.${auditLog.action.toLowerCase()}` as any,
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="truncate">
                            <Badge
                              className="text-xs"
                              variant={getSourceBadgeVariant(auditLog.source)}
                            >
                              {getSourceDisplayName(auditLog.source, t)}
                            </Badge>
                          </TableCell>
                          <TableCell className="truncate">
                            <Badge className="text-xs" variant="primary">
                              {t(
                                `general.${auditLog.targetType.toLowerCase()}` as any,
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="truncate">
                            {getBrowserName(auditLog.browser) ??
                              t('general.unknown')}
                          </TableCell>
                          <TableCell className="truncate">
                            {auditLog.ipAddress ?? t('general.unknown')}
                          </TableCell>
                          <TableCell className="truncate">
                            <DateConverter date={auditLog.createdAt} />
                          </TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-background">
                          <TableCell className="p-0" colSpan={7}>
                            <div
                              className={`expanded-content ${expandedRows.has(auditLog.id) ? 'open' : ''}`}
                            >
                              {(expandedRows.has(auditLog.id) ||
                                animatingRows.has(auditLog.id)) && (
                                <ExpandedContent
                                  auditLog={auditLog}
                                  setAuditLogModalOpen={setAuditLogModalOpen}
                                  setSelectedAuditLog={setSelectedAuditLog}
                                />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))}
                  </TableBody>
                )}
              </Table>
              <TablePagination
                page={page}
                pageSize={pageSize}
                setPage={setPage}
                setPageSize={setPageSize}
                totalItems={totalAuditLogs}
                totalPages={Math.ceil(totalAuditLogs / pageSize)}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex w-full max-w-xl flex-col items-center justify-center gap-4">
                <div className="flex">
                  <span className="rounded-lg bg-secondary p-4">
                    <Logs className="h-6 w-6" />
                  </span>
                </div>
                <h3 className="text-lg font-bold">
                  {t('dashboard.audit_logs.no_audit_logs_title')}
                </h3>
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  {t('dashboard.audit_logs.no_audit_logs_description')}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
