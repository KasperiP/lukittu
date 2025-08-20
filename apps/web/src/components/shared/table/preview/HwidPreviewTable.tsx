import {
  ILicenseHwidGetResponse,
  ILicenseHwidGetSuccessResponse,
} from '@/app/api/(dashboard)/licenses/[slug]/hwid/route';
import { DateConverter } from '@/components/shared/DateConverter';
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
import { TeamContext } from '@/providers/TeamProvider';
import { License } from '@lukittu/shared';
import { ArrowDownUp, CheckCircle, EyeOff, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

interface HwidPreviewTableProps {
  licenseId: string;
  license?: Omit<License, 'licenseKeyLookup'> | null;
}

const fetchHwids = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ILicenseHwidGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function HwidPreviewTable({
  licenseId,
  license,
}: HwidPreviewTableProps) {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);

  const [page, setPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<'lastSeenAt' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
    null,
  );

  const searchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: '10',
    ...(sortColumn && { sortColumn }),
    ...(sortDirection && { sortDirection }),
  });

  const { data, error, isLoading } = useSWR<ILicenseHwidGetSuccessResponse>(
    teamCtx.selectedTeam && licenseId
      ? [`/api/licenses/${licenseId}/hwid`, searchParams.toString()]
      : null,
    ([url, params]) => fetchHwids(`${url}?${params}`),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const hwids = data?.hwids ?? [];
  const totalResults = data?.totalResults ?? 0;

  const activeCount = hwids.filter((hwid) => hwid.status === 'active').length;
  const hwidLimit = license?.hwidLimit;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b py-5">
        <CardTitle className="text-xl font-bold">
          {t('general.hardware_identifiers')}
        </CardTitle>
        {!isLoading && (
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  hwidLimit === null || hwidLimit === undefined
                    ? 'outline'
                    : activeCount > hwidLimit
                      ? 'error'
                      : activeCount === hwidLimit
                        ? 'warning'
                        : 'outline'
                }
              >
                {hwidLimit === null || hwidLimit === undefined
                  ? `${activeCount}/∞`
                  : `${activeCount}/${hwidLimit}`}
              </Badge>
              <span className="text-muted-foreground">
                {t('general.active')}
              </span>
            </div>
            <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
              {hwidLimit === null || hwidLimit === undefined ? (
                <div
                  className="h-full rounded-full bg-muted"
                  style={{ width: '0%' }}
                />
              ) : hwidLimit > 0 ? (
                <div
                  className={`h-full rounded-full transition-all ${
                    activeCount > hwidLimit
                      ? 'bg-red-500'
                      : activeCount === hwidLimit
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                  }`}
                  style={{
                    width: `${Math.min((activeCount / hwidLimit) * 100, 100)}%`,
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
        )}
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {totalResults ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="truncate">
                    {t('general.hardware_identifier')}
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
                </TableRow>
              </TableHeader>
              {isLoading ? (
                <TableSkeleton columns={3} height={4} rows={3} />
              ) : (
                <TableBody>
                  {hwids.map((hwid) => (
                    <TableRow key={hwid.id}>
                      <TableCell>{hwid.hwid}</TableCell>
                      <TableCell className="truncate">
                        <DateConverter date={hwid.lastSeenAt} />
                      </TableCell>
                      <TableCell>
                        {hwid.status === 'inactive' ? (
                          <Badge variant="error">
                            <XCircle className="mr-1 h-3 w-3" />
                            {t('general.inactive')}
                          </Badge>
                        ) : hwid.status === 'forgotten' ? (
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
            {t('dashboard.licenses.no_hwid_data')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
