'use client';
import {
  IStatisticsRecentAuditLogsResponse,
  IStatisticsRecentAuditLogsSuccessResponse,
} from '@/app/api/(dashboard)/statistics/recent-audit-logs/route';
import { DateConverter } from '@/components/shared/DateConverter';
import { CountryFlag } from '@/components/shared/misc/CountryFlag';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import {
  getIntegrationLogoSrc,
  getSourceAvatarColor,
  getSourceDisplayName,
} from '@/lib/utils/audit-helpers';
import { getInitials } from '@/lib/utils/text-helpers';
import { TeamContext } from '@/providers/TeamProvider';
import { AuditLogSource } from '@lukittu/shared';
import { ArrowLeft, ArrowRight, Bot, Logs, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

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

const fetchRecentAuditLogs = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IStatisticsRecentAuditLogsResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function RecentAuditLogs() {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);

  const [page, setPage] = useState(1);

  const {
    data: response,
    error,
    isLoading,
  } = useSWR<IStatisticsRecentAuditLogsSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/statistics/recent-audit-logs', teamCtx.selectedTeam, page]
      : null,
    ([url, _, page]) => fetchRecentAuditLogs(`${url}?page=${page}`),
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
            {t('dashboard.dashboard.recent_audit_logs')}
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
            {t('dashboard.dashboard.recent_audit_logs_description')}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {hasData || isLoading ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="truncate">
                  {t('general.action')}
                </TableHead>
                <TableHead className="truncate">
                  {t('general.ip_address')}
                </TableHead>
                <TableHead className="truncate">
                  {t('general.created_at')}
                </TableHead>
              </TableRow>
            </TableHeader>
            {isLoading ? (
              <TableSkeleton columns={3} rows={4} />
            ) : (
              <TableBody>
                {response?.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="flex items-center gap-2 truncate">
                      <Avatar
                        className={`h-8 w-8 border ${
                          row.source === AuditLogSource.DASHBOARD ||
                          (row.source === AuditLogSource.DISCORD_INTEGRATION &&
                            row.email)
                            ? ''
                            : 'p-0'
                        }`}
                      >
                        {row.source === AuditLogSource.DASHBOARD ||
                        (row.source === AuditLogSource.DISCORD_INTEGRATION &&
                          row.email) ? (
                          <>
                            <AvatarImage src={row.imageUrl!} />
                            <AvatarFallback className="bg-primary text-xs text-white">
                              {getInitials(row.fullName ?? '??')}
                            </AvatarFallback>
                          </>
                        ) : getIntegrationLogoSrc(row.source) ? (
                          <Image
                            alt={getSourceDisplayName(row.source, t)}
                            className="rounded-full object-cover"
                            src={getIntegrationLogoSrc(row.source)!}
                            fill
                          />
                        ) : (
                          <AvatarFallback
                            className={`${getSourceAvatarColor(row.source)} text-xs text-white`}
                          >
                            {getSourceLogoOrIcon(row.source)}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <span>
                        <b>
                          {row.source === AuditLogSource.DASHBOARD
                            ? (row.email ?? t('general.unknown'))
                            : row.source ===
                                  AuditLogSource.DISCORD_INTEGRATION &&
                                row.email
                              ? row.email
                              : getSourceDisplayName(row.source, t)}
                        </b>{' '}
                        {t(
                          `dashboard.audit_logs.actions_types.${row.action.toLowerCase()}` as any,
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {row.alpha2 && (
                          <span className="flex-shrink-0">
                            <CountryFlag
                              countryCode={row.alpha2}
                              countryName={row.country}
                            />
                          </span>
                        )}
                        <span>{row.ipAddress ?? t('general.unknown')}</span>
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
                  <Logs className="h-6 w-6" />
                </span>
              </div>
              <h3 className="text-lg font-bold">
                {t('dashboard.dashboard.no_recent_audit_logs')}
              </h3>
              <p className="max-w-sm text-center text-sm text-muted-foreground">
                {t('dashboard.dashboard.no_recent_audit_logs_description')}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
