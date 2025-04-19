'use client';
import {
  ILicenseIpAddressGetResponse,
  ILicenseIpAddressGetSuccessResponse,
} from '@/app/api/(dashboard)/licenses/[slug]/ip-address/route';
import { DateConverter } from '@/components/shared/DateConverter';
import TablePagination from '@/components/shared/table/TablePagination';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
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
import { ArrowDownUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { CountryFlag } from '../../misc/CountryFlag';

interface IpAddressPreviewTableProps {
  licenseId: string;
}

const fetchIpAddresses = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ILicenseIpAddressGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function IpAddressPreviewTable({
  licenseId,
}: IpAddressPreviewTableProps) {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);

  const [page, setPage] = useState(1);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const searchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: '10',
    sortDirection,
  });

  const { data, error, isLoading } =
    useSWR<ILicenseIpAddressGetSuccessResponse>(
      teamCtx.selectedTeam
        ? [`/api/licenses/${licenseId}/ip-address`, searchParams.toString()]
        : null,
      ([url, params]) => fetchIpAddresses(`${url}?${params}`),
    );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const ipAddresses = data?.ipAddresses ?? [];
  const totalResults = data?.totalResults ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b py-5">
        <CardTitle className="text-xl font-bold">
          {t('general.ip_addresses')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {totalResults ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="truncate">
                    {t('general.ip_address')}
                  </TableHead>
                  <TableHead className="truncate">
                    {t('general.request_count')}
                  </TableHead>
                  <TableHead className="truncate">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setSortDirection(
                          sortDirection === 'asc' ? 'desc' : 'asc',
                        )
                      }
                    >
                      {t('general.last_seen')}
                      <ArrowDownUp className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              {isLoading ? (
                <TableSkeleton columns={3} rows={3} />
              ) : (
                <TableBody>
                  {ipAddresses.map((ip) => (
                    <TableRow key={ip.ipAddress}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0">
                            {ip.alpha2 && (
                              <CountryFlag
                                countryCode={ip.alpha2}
                                countryName={ip.country}
                              />
                            )}
                          </span>
                          <span>{ip.ipAddress}</span>
                        </div>
                      </TableCell>
                      <TableCell>{ip.requestCount}</TableCell>
                      <TableCell>
                        <DateConverter date={ip.lastSeen} />
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
