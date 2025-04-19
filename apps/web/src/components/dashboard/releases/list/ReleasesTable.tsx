'use client';
import {
  IProductsReleasesGetResponse,
  IProductsReleasesGetSuccessResponse,
} from '@/app/api/(dashboard)/products/releases/route';
import { DateConverter } from '@/components/shared/DateConverter';
import AddEntityButton from '@/components/shared/misc/AddEntityButton';
import TablePagination from '@/components/shared/table/TablePagination';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTableScroll } from '@/hooks/useTableScroll';
import { bytesToSize } from '@/lib/utils/number-helpers';
import { cn } from '@/lib/utils/tailwind-helpers';
import { ReleaseModalProvider } from '@/providers/ReleasesModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { ArrowDownUp, CloudOff, CloudUpload, Lock, Rss } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { ReleasesActionDropdown } from '../ReleasesActionDropdown';
import { WarningIndicator } from './WarningIndicator';

interface ReleasesTableProps {
  productId: string;
}

const fetchReleases = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IProductsReleasesGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export function ReleasesTable({ productId }: ReleasesTableProps) {
  const locale = useLocale();
  const t = useTranslations();
  const { showDropdown, containerRef } = useTableScroll();
  const teamCtx = useContext(TeamContext);

  const [sortColumn, setSortColumn] = useState<'createdAt' | 'version'>(
    'createdAt',
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const searchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: '10',
    sortColumn,
    sortDirection,
    productId,
  });

  const { data, error, isLoading } =
    useSWR<IProductsReleasesGetSuccessResponse>(
      teamCtx.selectedTeam
        ? [
            '/api/products/releases',
            teamCtx.selectedTeam,
            searchParams.toString(),
          ]
        : null,
      ([url, _, params]) => fetchReleases(`${url}?${params}`),
    );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const releases = data?.releases ?? [];
  const totalReleases = data?.totalResults ?? 1;
  const noLatestRelease = Boolean(
    data?.releases.length && !data.hasLatestRelease,
  );

  return (
    <ReleaseModalProvider productId={productId}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-xl font-bold">
            {t('dashboard.navigation.releases')}
            <div className="ml-auto flex items-center gap-2">
              {noLatestRelease && <WarningIndicator />}
              <AddEntityButton entityType="release" variant="outline" />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalReleases && teamCtx.selectedTeam ? (
            <>
              <Table
                className="relative"
                containerRef={containerRef as React.RefObject<HTMLDivElement>}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead className="truncate">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSortColumn('version');
                          setSortDirection(
                            sortColumn === 'version' && sortDirection === 'asc'
                              ? 'desc'
                              : 'asc',
                          );
                        }}
                      >
                        {t('general.version')}
                        <ArrowDownUp className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.status')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.file')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.last_seen')}
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
                  <TableSkeleton columns={5} rows={6} />
                ) : (
                  <TableBody>
                    {releases.map((release) => (
                      <TableRow key={release.id}>
                        <TableCell className="truncate">
                          <div className="flex items-center gap-2">
                            {release.version}{' '}
                            {release.latest && (
                              <Badge className="text-xs">
                                <Rss className="mr-1 h-3 w-3" />
                                {t('general.latest')}
                              </Badge>
                            )}
                            {release.allowedLicenses.length > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      className="text-xs"
                                      variant="secondary"
                                    >
                                      <Lock className="mr-1 h-2.5 w-2.5" />
                                      <span className="pointer-events-none">
                                        {release.allowedLicenses.length}
                                      </span>
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t(
                                      'dashboard.releases.license_restricted_tooltip',
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="truncate">
                          <Badge
                            className="text-xs"
                            variant={
                              release.status === 'PUBLISHED'
                                ? 'success'
                                : 'secondary'
                            }
                          >
                            {t(
                              `general.${release.status.toLowerCase()}` as any,
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="truncate">
                          {release.file ? (
                            <div className="flex items-center gap-2">
                              <CloudUpload size={18} />{' '}
                              {bytesToSize(release.file.size)}
                            </div>
                          ) : (
                            <span className="flex items-center gap-2">
                              <CloudOff size={18} />
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="truncate">
                          {release.lastSeenAt ? (
                            <DateConverter date={release.lastSeenAt} />
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={new Date(release.createdAt).toLocaleString(
                            locale,
                          )}
                        >
                          <DateConverter date={release.createdAt} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'sticky right-0 w-[50px] truncate px-2 py-0 text-right',
                            {
                              'bg-background drop-shadow-md': showDropdown,
                            },
                          )}
                        >
                          <ReleasesActionDropdown release={release} />
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
                totalItems={totalReleases}
                totalPages={Math.ceil(totalReleases / 10)}
              />
            </>
          ) : (
            <div className="flex h-24 flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
              {t('dashboard.releases.no_releases_assigned')}
            </div>
          )}
        </CardContent>
      </Card>
    </ReleaseModalProvider>
  );
}
