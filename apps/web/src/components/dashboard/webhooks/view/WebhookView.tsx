'use client';
import {
  IWebhookGetResponse,
  IWebhookGetSuccessResponse,
} from '@/app/api/(dashboard)/webhooks/[slug]/details/route';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { TeamContext } from '@/providers/TeamProvider';
import { WebhookModalProvider } from '@/providers/WebhookModalProvider';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useContext, useEffect } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { WebhooksActionDropdown } from '../WebhooksActionDropdown';
import { WebhookDetails } from './WebhookDetails';
import { WebhookEventsTable } from './WebhookEventsTable';
import { WebhookStatsChart } from './WebhookStatsChart';

const fetchWebhook = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IWebhookGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function WebhookView() {
  const params = useParams();
  const t = useTranslations();
  const router = useRouter();
  const teamCtx = useContext(TeamContext);
  const webhookId = params.slug as string;

  const { data, error, isLoading } = useSWR<IWebhookGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/webhooks', webhookId, teamCtx.selectedTeam]
      : null,
    ([url, webhookId]) => fetchWebhook(`${url}/${webhookId}/details`),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
      router.push('/dashboard/webhooks');
    }
  }, [error, router, t]);

  const webhook = data?.webhook;

  return (
    <WebhookModalProvider>
      <div className="flex items-center justify-between gap-2">
        {isLoading ? (
          <Skeleton className="h-8 w-96" />
        ) : (
          <h1 className="truncate text-2xl font-bold">{webhook?.name}</h1>
        )}
        {isLoading ? (
          <Skeleton className="h-10 w-10 max-sm:w-12" />
        ) : (
          <WebhooksActionDropdown variant="outline" webhook={webhook!} />
        )}
      </div>
      <Separator className="mt-2" />
      <div className="mt-6">
        <div className="flex">
          <div className="flex w-full gap-4 max-xl:flex-col-reverse">
            <div className="flex w-full max-w-full flex-col gap-4 overflow-auto">
              <WebhookStatsChart webhookId={webhookId} />
              <WebhookEventsTable webhookId={webhookId} />
            </div>
            <aside className="flex w-full max-w-96 flex-shrink-0 flex-col gap-4 max-xl:max-w-full">
              <WebhookDetails webhook={webhook ?? null} />
            </aside>
          </div>
        </div>
      </div>
    </WebhookModalProvider>
  );
}
