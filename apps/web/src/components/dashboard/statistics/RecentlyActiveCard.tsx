'use client';
import {
  IStatisticsRecentActivityGetResponse,
  IStatisticsRecentActivityGetSuccessResponse,
} from '@/app/api/(dashboard)/statistics/recent-activity/route';
import { DateConverter } from '@/components/shared/DateConverter';
import { CountryFlag } from '@/components/shared/misc/CountryFlag';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { normalizePath } from '@/lib/utils/text-helpers';
import { TeamContext } from '@/providers/TeamProvider';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

const fetchRecentActivity = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IStatisticsRecentActivityGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function RecentlyActiveCard() {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);

  const [page, setPage] = useState(1);

  const {
    data: response,
    error,
    isLoading,
  } = useSWR<IStatisticsRecentActivityGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/statistics/recent-activity', teamCtx.selectedTeam, page]
      : null,
    ([url, _, page]) => fetchRecentActivity(`${url}?page=${page}`),
    {
      refreshInterval: 30 * 1000,
    },
  );

  const hasNextPage = response?.hasNextPage ?? false;

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.error_occurred'));
    }
  }, [error, t]);

  const hasData =
    response?.data.length !== undefined ? response.data.length > 0 : false;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b py-5">
        <div className="grid flex-1 gap-1">
          <CardTitle className="flex items-center text-xl font-bold">
            {t('dashboard.dashboard.recently_activity')}
            <div className="ml-auto flex gap-2">
              <Button
                className="h-8 w-8 p-0"
                disabled={page === 1}
                variant="outline"
                onClick={() => handlePageChange(page - 1)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                className="h-8 w-8 p-0"
                disabled={!hasNextPage}
                variant="outline"
                onClick={() => handlePageChange(page + 1)}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            {t('dashboard.dashboard.recently_activity_description')}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {hasData || isLoading ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('general.license')}</TableHead>
                <TableHead>{t('general.path')}</TableHead>
                <TableHead>{t('dashboard.licenses.status')}</TableHead>
                <TableHead>{t('general.ip_address')}</TableHead>
                <TableHead>{t('general.created_at')}</TableHead>
              </TableRow>
            </TableHeader>
            {isLoading ? (
              <TableSkeleton columns={5} rows={4} />
            ) : (
              <TableBody>
                {response?.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="truncate">{row.license}</TableCell>
                    <TableCell className="truncate">
                      {normalizePath(row.path)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className="mr-2"
                        variant={
                          row.statusCode >= 200 && row.statusCode < 300
                            ? 'success'
                            : row.statusCode === 500
                              ? 'error'
                              : 'warning'
                        }
                      >
                        {row.statusCode >= 200 && row.statusCode < 300 ? (
                          <CheckCircle className="mr-1 h-3 w-3" />
                        ) : row.statusCode === 500 ? (
                          <XCircle className="mr-1 h-3 w-3" />
                        ) : (
                          <AlertTriangle className="mr-1 h-3 w-3" />
                        )}
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="flex-shrink-0">
                          {row.alpha2 && (
                            <CountryFlag
                              countryCode={row.alpha2}
                              countryName={row.country}
                            />
                          )}
                        </span>
                        <span>{row.ipAddress}</span>
                      </div>
                    </TableCell>
                    <TableCell className="truncate">
                      <DateConverter date={row.createdAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex w-full max-w-xl flex-col items-center justify-center gap-4">
              <div className="flex">
                <span className="rounded-lg bg-secondary p-4">
                  <Clock className="h-6 w-6" />
                </span>
              </div>
              <h3 className="text-lg font-bold">
                {t('dashboard.dashboard.no_recent_activity')}
              </h3>
              <p className="max-w-sm text-center text-sm text-muted-foreground">
                {t('dashboard.dashboard.no_recent_activity_description')}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
