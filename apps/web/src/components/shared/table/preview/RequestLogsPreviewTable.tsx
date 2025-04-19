'use client';
import {
  ILogsGetResponse,
  ILogsGetSuccessResponse,
} from '@/app/api/(dashboard)/logs/route';
import { DateConverter } from '@/components/shared/DateConverter';
import TablePagination from '@/components/shared/table/TablePagination';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TeamContext } from '@/providers/TeamProvider';
import { AlertTriangle, ArrowDownUp, CheckCircle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { CountryFlag } from '../../misc/CountryFlag';

interface RequestLogsPreviewTableProps {
  licenseId: string;
}

const timeRangeToDate = (timeRange: string) => {
  const date = new Date();
  switch (timeRange) {
    case '24h':
      date.setDate(date.getDate() - 1);
      break;
    case '7d':
      date.setDate(date.getDate() - 7);
      break;
    case '30d':
      date.setDate(date.getDate() - 30);
      break;
  }
  return date;
};

const fetchRequestLogs = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ILogsGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function RequestLogsPreviewTable({
  licenseId,
}: RequestLogsPreviewTableProps) {
  const t = useTranslations();
  const router = useRouter();
  const [timeRange, setTimeRange] = useState('7d');
  const teamCtx = useContext(TeamContext);

  const [page, setPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<'createdAt' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
    null,
  );

  const timeRangeToUse = useMemo(() => timeRangeToDate(timeRange), [timeRange]);

  const searchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: '10',
    ...(sortColumn && { sortColumn }),
    ...(sortDirection && { sortDirection }),
    ...(licenseId && { licenseId }),
    rangeStart: timeRangeToUse.toISOString(),
  });

  const { data, error, isLoading } = useSWR<ILogsGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/logs', teamCtx.selectedTeam, searchParams.toString()]
      : null,
    ([url, _, params]) => fetchRequestLogs(`${url}?${params}`),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const logs = data?.logs ?? [];
  const totalLogs = data?.totalResults ?? 1;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b py-5">
        <div className="grid flex-1 gap-1">
          <CardTitle className="text-xl font-bold">
            {t('dashboard.navigation.logs')}
          </CardTitle>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[160px] rounded-lg sm:ml-auto">
            <SelectValue placeholder={t('dashboard.dashboard.last_24_hours')} />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem className="rounded-lg" value="24h">
              {t('dashboard.dashboard.last_24_hours')}
            </SelectItem>
            <SelectItem className="rounded-lg" value="7d">
              {t('dashboard.dashboard.last_7_days')}
            </SelectItem>
            <SelectItem className="rounded-lg" value="30d">
              {t('dashboard.dashboard.last_30_days')}
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {totalLogs ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="truncate">
                    {t('general.ip_address')}
                  </TableHead>
                  <TableHead className="truncate">
                    {t('dashboard.licenses.status')}
                  </TableHead>
                  <TableHead className="truncate">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSortColumn('createdAt');
                        setSortDirection(
                          sortColumn === 'createdAt' && sortDirection === 'asc'
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
                <TableSkeleton columns={4} rows={3} />
              ) : (
                <TableBody>
                  {logs.map((log) => (
                    <TableRow
                      key={log.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/logs/${log.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0">
                            {log.alpha2 && (
                              <CountryFlag
                                countryCode={log.alpha2}
                                countryName={log.country}
                              />
                            )}
                          </span>
                          <span>{log.ipAddress}</span>
                        </div>
                      </TableCell>
                      <TableCell className="truncate">
                        <Badge
                          className="text-xs"
                          variant={
                            log.statusCode >= 200 && log.statusCode < 300
                              ? 'success'
                              : log.statusCode === 500
                                ? 'error'
                                : 'warning'
                          }
                        >
                          {log.statusCode >= 200 && log.statusCode < 300 ? (
                            <CheckCircle className="mr-1 h-3 w-3" />
                          ) : log.statusCode === 500 ? (
                            <XCircle className="mr-1 h-3 w-3" />
                          ) : (
                            <AlertTriangle className="mr-1 h-3 w-3" />
                          )}
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="truncate">
                        <DateConverter date={log.createdAt} />
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
              totalItems={totalLogs}
              totalPages={Math.ceil(totalLogs / 10)}
            />
          </>
        ) : (
          <div className="flex h-24 flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
            {t('dashboard.logs.no_logs')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
