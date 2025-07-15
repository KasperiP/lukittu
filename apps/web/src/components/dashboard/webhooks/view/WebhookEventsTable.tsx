import {
  IWebhookEventsGetResponse,
  IWebhookEventsGetSuccessResponse,
} from '@/app/api/(dashboard)/webhooks/[slug]/events/route';
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
import { User, WebhookEvent } from '@lukittu/shared';
import { ArrowDownUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { WebhookEventDetailsModal } from './WebhookEventDetailsModal';
import { WebhookStatusBadge } from './WebhookStatusBadge';

const fetchWebhookEvents = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IWebhookEventsGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

interface WebhookEventsTableProps {
  webhookId: string;
}

export function WebhookEventsTable({ webhookId }: WebhookEventsTableProps) {
  const locale = useLocale();
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortColumn, setSortColumn] = useState<
    'createdAt' | 'updatedAt' | 'status' | 'eventType' | null
  >(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
    null,
  );

  const [selectedEvent, setSelectedEvent] = useState<
    (WebhookEvent & { user: Omit<User, 'passwordHash'> | null }) | null
  >(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleRowClick = (
    event: WebhookEvent & { user: Omit<User, 'passwordHash'> | null },
  ) => {
    setSelectedEvent(event);
    setIsModalOpen(true);
  };

  const searchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(sortColumn && { sortColumn }),
    ...(sortDirection && { sortDirection }),
  });

  const { data, error, isLoading } = useSWR<IWebhookEventsGetSuccessResponse>(
    teamCtx.selectedTeam
      ? [
          `/api/webhooks/${webhookId}/events`,
          teamCtx.selectedTeam,
          searchParams.toString(),
        ]
      : null,
    ([url, _, params]) => fetchWebhookEvents(`${url}?${params}`),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const events = data?.events ?? [];
  const totalEvents = data?.totalResults ?? 0;
  const hasEvents = data?.hasResults ?? false;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b py-5">
          <CardTitle className="flex items-center text-xl font-bold">
            {t('dashboard.webhooks.webhook_events')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
          {hasEvents ? (
            <>
              <Table className="relative">
                <TableHeader>
                  <TableRow>
                    <TableHead className="truncate">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSortColumn('eventType');
                          setSortDirection(
                            sortColumn === 'eventType' &&
                              sortDirection === 'asc'
                              ? 'desc'
                              : 'asc',
                          );
                        }}
                      >
                        {t('general.event_type')}
                        <ArrowDownUp className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="truncate">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSortColumn('status');
                          setSortDirection(
                            sortColumn === 'status' && sortDirection === 'asc'
                              ? 'desc'
                              : 'asc',
                          );
                        }}
                      >
                        {t('general.status')}
                        <ArrowDownUp className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.attempts')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.response_status')}
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
                    <TableHead className="truncate">
                      {t('general.last_attempt_at')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                {isLoading ? (
                  <TableSkeleton columns={6} rows={7} />
                ) : (
                  <TableBody>
                    {events.map((event) => (
                      <TableRow
                        key={event.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(event)}
                      >
                        <TableCell className="truncate font-medium">
                          <Badge className="text-xs" variant="outline">
                            {event.eventType}
                          </Badge>
                        </TableCell>
                        <TableCell className="truncate">
                          <WebhookStatusBadge status={event.status} />
                        </TableCell>
                        <TableCell className="truncate">
                          {event.attempts}
                        </TableCell>
                        <TableCell className="truncate">
                          {event.responseCode ? (
                            <Badge
                              className="text-xs"
                              variant={
                                event.responseCode >= 200 &&
                                event.responseCode < 300
                                  ? 'success'
                                  : 'error'
                              }
                            >
                              {event.responseCode}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={new Date(event.createdAt).toLocaleString(
                            locale,
                          )}
                        >
                          <DateConverter date={event.createdAt} />
                        </TableCell>
                        <TableCell className="truncate">
                          {event.lastAttemptAt ? (
                            <DateConverter date={event.lastAttemptAt} />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                )}
              </Table>
              <TablePagination
                page={page}
                pageSize={pageSize}
                setPage={setPage}
                setPageSize={setPageSize}
                totalItems={totalEvents}
                totalPages={Math.ceil(totalEvents / pageSize)}
              />
            </>
          ) : (
            <div className="flex h-24 flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
              {t('dashboard.webhooks.no_webhook_events_found')}
            </div>
          )}
        </CardContent>
      </Card>

      <WebhookEventDetailsModal
        event={selectedEvent}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </>
  );
}
