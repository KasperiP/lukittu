'use client';
import {
  ILicenseIpAddressGetResponse,
  ILicenseIpAddressGetSuccessResponse,
} from '@/app/api/(dashboard)/licenses/[slug]/ip-address/route';
import { DateConverter } from '@/components/shared/DateConverter';
import TablePagination from '@/components/shared/table/TablePagination';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
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
import { useTableScroll } from '@/hooks/useTableScroll';
import { cn } from '@/lib/utils/tailwind-helpers';
import { TeamContext } from '@/providers/TeamProvider';
import { License } from '@lukittu/shared';
import { ArrowDownUp, CheckCircle, Eye, EyeOff, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { CountryFlag } from '../../misc/CountryFlag';
import { IpActionDropdown } from './IpActionDropdown';

interface IpPreviewTableProps {
  licenseId: string;
  license?: Omit<License, 'licenseKeyLookup'> | null;
}

const fetchIpAddresses = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ILicenseIpAddressGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function IpPreviewTable({
  licenseId,
  license,
}: IpPreviewTableProps) {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);
  const { showDropdown, containerRef } = useTableScroll();

  const [page, setPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<'lastSeenAt' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
    null,
  );
  const [showForgotten, setShowForgotten] = useState(false);

  const searchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: '10',
    ...(sortColumn && { sortColumn }),
    ...(sortDirection && { sortDirection }),
    ...(showForgotten && { showForgotten: 'true' }),
  });

  const { data, error, isLoading } =
    useSWR<ILicenseIpAddressGetSuccessResponse>(
      teamCtx.selectedTeam && licenseId
        ? [
            `/api/licenses/${licenseId}/ip-address`,
            teamCtx.selectedTeam,
            searchParams.toString(),
          ]
        : null,
      ([url, _, params]) => fetchIpAddresses(`${url}?${params}`),
    );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const showSkeleton = isLoading && !data;

  const ipAddresses = data?.ipAddresses ?? [];
  const totalResults = data?.totalResults ?? 0;

  const activeCount = ipAddresses.filter((ip) => ip.status === 'active').length;
  const ipLimit = license?.ipLimit;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b py-5">
        <div className="grid gap-1">
          <CardTitle className="text-xl font-bold">
            {t('general.ip_addresses')}
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Badge
                className="h-5"
                variant={
                  showSkeleton
                    ? 'outline'
                    : ipLimit === null || ipLimit === undefined
                      ? 'outline'
                      : activeCount > ipLimit
                        ? 'error'
                        : activeCount === ipLimit
                          ? 'warning'
                          : 'outline'
                }
              >
                {showSkeleton ? (
                  <span className="opacity-50">--/--</span>
                ) : ipLimit === null || ipLimit === undefined ? (
                  `${activeCount}/∞`
                ) : (
                  `${activeCount}/${ipLimit}`
                )}
              </Badge>
              <span>{t('general.active')}</span>
            </div>
            <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
              {showSkeleton ? (
                <Skeleton className="h-full w-full rounded-full" />
              ) : ipLimit === null || ipLimit === undefined ? (
                <div
                  className="h-full rounded-full bg-muted"
                  style={{ width: '0%' }}
                />
              ) : ipLimit > 0 ? (
                <div
                  className={`h-full rounded-full ${
                    activeCount > ipLimit
                      ? 'bg-red-500'
                      : activeCount === ipLimit
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                  }`}
                  style={{
                    width: `${Math.min((activeCount / ipLimit) * 100, 100)}%`,
                  }}
                />
              ) : (
                <div
                  className="h-full rounded-full bg-muted"
                  style={{ width: '0%' }}
                />
              )}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForgotten(!showForgotten)}
        >
          {showForgotten ? (
            <>
              <EyeOff className="h-4 w-4" />
              <span className="ml-1 max-sm:hidden">
                {t('general.hide_forgotten')}
              </span>
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              <span className="ml-1 max-sm:hidden">
                {t('general.show_forgotten')}
              </span>
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {totalResults || showSkeleton ? (
          <>
            <Table
              className="relative"
              containerRef={containerRef as React.RefObject<HTMLDivElement>}
            >
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-0 truncate">
                    {t('general.ip_address')}
                  </TableHead>
                  <TableHead className="truncate">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSortColumn('lastSeenAt');
                        setSortDirection(
                          sortColumn === 'lastSeenAt' && sortDirection === 'asc'
                            ? 'desc'
                            : 'asc',
                        );
                      }}
                    >
                      {t('general.last_seen')}
                      <ArrowDownUp className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="truncate">
                    {t('dashboard.licenses.status')}
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
              {showSkeleton ? (
                <TableSkeleton columns={4} height={4} rows={5} />
              ) : (
                <TableBody>
                  {ipAddresses.map((ip) => (
                    <TableRow key={ip.ip}>
                      <TableCell className="min-w-0 max-w-[150px] sm:max-w-[200px] lg:max-w-[250px] xl:max-w-[300px]">
                        <div className="flex min-w-0 items-center gap-2">
                          {ip.alpha2 && (
                            <span className="flex-shrink-0">
                              <CountryFlag
                                countryCode={ip.alpha2}
                                countryName={ip.country}
                              />
                            </span>
                          )}
                          <span className="min-w-0 truncate" title={ip.ip}>
                            {ip.ip}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DateConverter date={ip.lastSeenAt} />
                      </TableCell>
                      <TableCell>
                        {ip.status === 'inactive' ? (
                          <Badge variant="error">
                            <XCircle className="mr-1 h-3 w-3" />
                            {t('general.inactive')}
                          </Badge>
                        ) : ip.status === 'forgotten' ? (
                          <Badge variant="outline">
                            <EyeOff className="mr-1 h-3 w-3" />
                            {t('general.forgotten')}
                          </Badge>
                        ) : (
                          <Badge variant="success">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            {t('general.active')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'sticky right-0 w-[50px] truncate px-2 py-0 text-right',
                          {
                            'bg-background drop-shadow-md': showDropdown,
                          },
                        )}
                      >
                        <IpActionDropdown ip={ip} licenseId={licenseId} />
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
              totalItems={totalResults}
              totalPages={Math.ceil(totalResults / 10)}
            />
          </>
        ) : (
          <div className="flex h-24 flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
            {t('dashboard.licenses.no_ip_addresses')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
