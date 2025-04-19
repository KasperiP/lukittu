'use client';
import { ISessionsSignOutResponse } from '@/app/api/(dashboard)/sessions/[slug]/route';
import {
  ISessionsGetSuccessResponse,
  ISessionsSignOutAllResponse,
} from '@/app/api/(dashboard)/sessions/route';
import { DateConverter } from '@/components/shared/DateConverter';
import LoadingButton from '@/components/shared/LoadingButton';
import { CountryFlag } from '@/components/shared/misc/CountryFlag';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

const fetchSessions = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
};

export default function SessionsTable() {
  const t = useTranslations();
  const [pendingSingleId, setPendingSingleId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, error, mutate } = useSWR<ISessionsGetSuccessResponse>(
    '/api/sessions',
    fetchSessions,
  );

  const hasOtherThanCurrentSession = data?.sessions.some(
    (session) => !session.current,
  );

  const handleSignOutSingleSession = async (id: string) => {
    setPendingSingleId(id);
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'DELETE',
      });
      const data = (await res.json()) as ISessionsSignOutResponse;

      if ('message' in data) {
        toast.error(data.message);
        return;
      }

      await mutate();
      toast.success(t('dashboard.profile.logged_out_session'));
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setPendingSingleId(null);
    }
  };

  const handleSignOutAllSessions = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'DELETE',
      });
      const data = (await res.json()) as ISessionsSignOutAllResponse;

      if ('message' in data) {
        toast.error(data.message);
        return;
      }

      await mutate();
      toast.success(t('dashboard.profile.logged_out_all_sessions'));
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold">
          {t('dashboard.profile.login_sessions')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="truncate">{t('general.device')}</TableHead>
              <TableHead className="truncate">
                {t('general.ip_address')}
              </TableHead>
              <TableHead className="truncate">{t('general.date')}</TableHead>
              <TableHead className="text-right">
                {t('general.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          {!data ? (
            <TableSkeleton columns={4} rows={4} />
          ) : (
            <TableBody>
              {data.sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="truncate">
                    {`${session.browser ?? 'N/A'} - ${session.os ?? ''}`.trim()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="flex-shrink-0">
                        {session.alpha2 && (
                          <CountryFlag
                            countryCode={session.alpha2}
                            countryName={session.country}
                          />
                        )}
                      </span>
                      <span>{session.ipAddress}</span>
                    </div>
                  </TableCell>
                  <TableCell className="truncate">
                    <DateConverter date={session.createdAt} />
                  </TableCell>
                  <TableCell className="py-0 text-right">
                    {session.current ? (
                      t('dashboard.profile.current_session')
                    ) : (
                      <LoadingButton
                        pending={pendingSingleId === session.id}
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSignOutSingleSession(session.id)}
                      >
                        <LogOut size={20} />
                      </LoadingButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
        <LoadingButton
          className="mt-4"
          disabled={!hasOtherThanCurrentSession}
          pending={submitting}
          size="sm"
          variant="secondary"
          onClick={handleSignOutAllSessions}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t('dashboard.profile.logout_all_sessions')}
        </LoadingButton>
      </CardContent>
    </Card>
  );
}
