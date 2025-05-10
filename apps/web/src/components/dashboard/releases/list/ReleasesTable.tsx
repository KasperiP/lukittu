'use client';
import {
  IProductsBranchesGetResponse,
  IProductsBranchesGetSuccessResponse,
} from '@/app/api/(dashboard)/products/branches/route';
import {
  IProductsReleasesGetResponse,
  IProductsReleasesGetSuccessResponse,
} from '@/app/api/(dashboard)/products/releases/route';
import { DateConverter } from '@/components/shared/DateConverter';
import AddEntityDropdown from '@/components/shared/misc/AddEntityDropdown';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTableScroll } from '@/hooks/useTableScroll';
import { bytesToSize } from '@/lib/utils/number-helpers';
import { cn } from '@/lib/utils/tailwind-helpers';
import { BranchModalProvider } from '@/providers/BranchModalProvider';
import { ReleaseModalProvider } from '@/providers/ReleasesModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import {
  ArrowDownUp,
  CloudOff,
  CloudUpload,
  Lock,
  Rss,
  TriangleAlert,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { BranchActionDropdown } from '../BranchActionDropdown';
import { BranchDeleteConfirmModal } from '../BranchDeleteConfirmModal';
import { ReleasesActionDropdown } from '../ReleasesActionDropdown';
import SetBranchModal from './SetBranchModal';

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

const fetchBranches = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IProductsBranchesGetResponse;

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
  const [activeTab, setActiveTab] = useState<'releases' | 'branches'>(
    'releases',
  );

  const [sortColumn, setSortColumn] = useState<'createdAt' | 'version'>(
    'createdAt',
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const releasesSearchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: '10',
    sortColumn,
    sortDirection,
    productId,
  });

  const {
    data: releasesData,
    error: releasesError,
    isLoading: releasesLoading,
  } = useSWR<IProductsReleasesGetSuccessResponse>(
    teamCtx.selectedTeam
      ? [
          '/api/products/releases',
          teamCtx.selectedTeam,
          releasesSearchParams.toString(),
        ]
      : null,
    ([url, _, params]) => fetchReleases(`${url}?${params}`),
  );

  const branchesSearchParams = new URLSearchParams({
    productId,
  });

  const {
    data: branchesData,
    error: branchesError,
    isLoading: branchesLoading,
  } = useSWR<IProductsBranchesGetSuccessResponse>(
    teamCtx.selectedTeam
      ? [
          '/api/products/branches',
          teamCtx.selectedTeam,
          branchesSearchParams.toString(),
        ]
      : null,
    ([url, _, params]) => fetchBranches(`${url}?${params}`),
  );

  useEffect(() => {
    if (releasesError) {
      toast.error(releasesError.message ?? t('general.server_error'));
    }
  }, [releasesError, t]);

  useEffect(() => {
    if (branchesError) {
      toast.error(branchesError.message ?? t('general.server_error'));
    }
  }, [branchesError, t]);

  const releases = releasesData?.releases ?? [];
  const totalReleases = releasesData?.totalResults ?? 1;
  const noLatestRelease = Boolean(
    releasesData?.releases.length && !releasesData.hasLatestRelease,
  );

  const branches = branchesData?.branches ?? [];

  const truncateBranchName = (name: string, maxLength = 20) =>
    name.length > maxLength ? `${name.substring(0, maxLength)}...` : name;

  return (
    <BranchModalProvider productId={productId}>
      <ReleaseModalProvider productId={productId}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-xl font-bold">
              {t('dashboard.navigation.releases')}
              <div className="ml-auto">
                <AddEntityDropdown
                  buttonText={t('general.create')}
                  entities={[
                    { type: 'branch', translationKey: 'general.branches' },
                    {
                      type: 'release',
                      translationKey: 'dashboard.navigation.releases',
                    },
                  ]}
                  variant="outline"
                />
              </div>
            </CardTitle>
          </CardHeader>

          {noLatestRelease && (
            <div className="mx-6 -mt-2 mb-4 flex items-center gap-2 rounded-md bg-yellow-500/10 px-4 py-2.5 text-yellow-700 dark:text-yellow-500 max-md:mx-4">
              <TriangleAlert className="h-5 w-5" />
              <div>
                <p className="text-sm font-medium">
                  {t('dashboard.releases.no_latest_release')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('dashboard.releases.no_latest_release_description')}
                </p>
              </div>
            </div>
          )}

          <CardContent>
            <Tabs
              className="mb-6"
              value={activeTab}
              onValueChange={(value) =>
                setActiveTab(value as 'releases' | 'branches')
              }
            >
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="releases">
                  {t('dashboard.navigation.releases')}
                </TabsTrigger>
                <TabsTrigger value="branches">
                  {t('general.branches')}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {activeTab === 'releases' ? (
              totalReleases && teamCtx.selectedTeam ? (
                <>
                  <Table
                    className="relative"
                    containerRef={
                      containerRef as React.RefObject<HTMLDivElement>
                    }
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead className="truncate">
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setSortColumn('version');
                              setSortDirection(
                                sortColumn === 'version' &&
                                  sortDirection === 'asc'
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
                          {t('general.branch')}
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
                    {releasesLoading ? (
                      <TableSkeleton columns={6} rows={6} />
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
                                    {release.branch && (
                                      <span className="ml-1">
                                        (
                                        {truncateBranchName(
                                          release.branch.name,
                                          10,
                                        )}
                                        )
                                      </span>
                                    )}
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
                              {release.branch ? (
                                <span title={release.branch.name}>
                                  {truncateBranchName(release.branch.name)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  N/A
                                </span>
                              )}
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
                                <span className="text-muted-foreground">
                                  N/A
                                </span>
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
              )
            ) : // Branches Tab Content
            teamCtx.selectedTeam && branches.length > 0 ? (
              <>
                <Table
                  className="relative"
                  containerRef={containerRef as React.RefObject<HTMLDivElement>}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead className="truncate">
                        {t('general.name')}
                      </TableHead>
                      <TableHead className="truncate">
                        {t('general.releases_count')}
                      </TableHead>
                      <TableHead className="truncate">
                        {t('general.created_at')}
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
                  {branchesLoading ? (
                    <TableSkeleton columns={4} rows={6} />
                  ) : (
                    <TableBody>
                      {branches.map((branch) => (
                        <TableRow key={branch.id}>
                          <TableCell className="truncate">
                            <span title={branch.name}>
                              {truncateBranchName(branch.name)}
                            </span>
                          </TableCell>
                          <TableCell className="truncate">
                            {branch.releaseCount}
                          </TableCell>
                          <TableCell
                            className="truncate"
                            title={new Date(branch.createdAt).toLocaleString(
                              locale,
                            )}
                          >
                            <DateConverter date={branch.createdAt} />
                          </TableCell>
                          <TableCell
                            className={cn(
                              'sticky right-0 w-[50px] truncate px-2 py-0 text-right',
                              {
                                'bg-background drop-shadow-md': showDropdown,
                              },
                            )}
                          >
                            <BranchActionDropdown branch={branch} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  )}
                </Table>
              </>
            ) : (
              <div className="flex h-24 flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
                {t('dashboard.releases.no_branches_assigned')}
              </div>
            )}
          </CardContent>
        </Card>
        <SetBranchModal />
        <BranchDeleteConfirmModal />
      </ReleaseModalProvider>
    </BranchModalProvider>
  );
}
