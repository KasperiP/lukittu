'use client';
import { DateConverter } from '@/components/shared/DateConverter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { User, WebhookEvent } from '@lukittu/shared';
import { Copy, User as UserIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { toast } from 'sonner';
import { WebhoookStatusBadge } from './WebhookStatusBadge';

interface WebhookEventDetailsModalProps {
  event: (WebhookEvent & { user: Omit<User, 'passwordHash'> | null }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WebhookEventDetailsModal({
  event,
  open,
  onOpenChange,
}: WebhookEventDetailsModalProps) {
  const t = useTranslations();
  const locale = useLocale();

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('general.copied_to_clipboard'));
    } catch (_error) {
      toast.error(t('general.error_occurred'));
    }
  };

  if (!event) return null;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-4xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('general.event_details')}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">
              {t('general.basic_information')}
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  ID
                </label>
                <div className="flex items-center gap-2">
                  <Copy className="h-4 w-4 shrink-0" />
                  <TooltipProvider>
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <span
                          className="truncate font-mono text-xs text-primary hover:underline"
                          role="button"
                          onClick={() => copyToClipboard(event.id)}
                        >
                          {event.id}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('general.click_to_copy')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-muted-foreground">
                  {t('general.event_type')}
                </label>
                <div>
                  <Badge variant="outline">{event.eventType}</Badge>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-muted-foreground">
                  {t('general.status')}
                </label>
                <div>
                  <WebhoookStatusBadge status={event.status} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-muted-foreground">
                  {t('general.attempts')}
                </label>
                <div className="text-sm">{event.attempts}</div>
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">
              {t('general.timing_information')}
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  {t('general.created_at')}
                </label>
                <div
                  className="text-sm"
                  title={new Date(event.createdAt).toLocaleString(locale)}
                >
                  <DateConverter date={event.createdAt} />
                </div>
              </div>

              {event.lastAttemptAt && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    {t('general.last_attempt_at')}
                  </label>
                  <div
                    className="text-sm"
                    title={new Date(event.lastAttemptAt).toLocaleString(locale)}
                  >
                    <DateConverter date={event.lastAttemptAt} />
                  </div>
                </div>
              )}

              {event.nextRetryAt && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    {t('general.next_retry_at')}
                  </label>
                  <div
                    className="text-sm"
                    title={new Date(event.nextRetryAt).toLocaleString(locale)}
                  >
                    <DateConverter date={event.nextRetryAt} />
                  </div>
                </div>
              )}

              {event.completedAt && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    {t('general.completed_at')}
                  </label>
                  <div
                    className="text-sm"
                    title={new Date(event.completedAt).toLocaleString(locale)}
                  >
                    <DateConverter date={event.completedAt} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <Separator />
          {(event.responseCode || event.errorMessage || event.responseBody) && (
            <>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">
                  {t('general.response_information')}
                </h3>

                {event.responseCode && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      {t('general.response_status')}
                    </label>
                    <div>
                      <Badge
                        variant={
                          event.responseCode >= 200 && event.responseCode < 300
                            ? 'success'
                            : 'error'
                        }
                      >
                        {event.responseCode}
                      </Badge>
                    </div>
                  </div>
                )}

                {event.errorMessage && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      {t('general.error')}
                    </label>
                    <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
                      <p className="text-sm font-medium text-destructive">
                        {event.errorMessage}
                      </p>
                    </div>
                  </div>
                )}

                {event.responseBody && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-muted-foreground">
                        {t('dashboard.logs.response_body')}
                      </label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(event.responseBody!)}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        {t('general.click_to_copy')}
                      </Button>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <pre className="overflow-auto whitespace-pre-wrap text-xs">
                        {event.responseBody}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
              <Separator />
            </>
          )}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {t('general.payload_information')}
              </h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  copyToClipboard(JSON.stringify(event.payload, null, 2))
                }
              >
                <Copy className="mr-1 h-3 w-3" />
                {t('general.click_to_copy')}
              </Button>
            </div>
            <div className="rounded-md bg-muted p-3">
              <pre className="overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </div>
          </div>
          {event.user && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">
                  {t('general.triggered_by')}
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 shrink-0" />
                    <Link
                      className="text-sm text-primary hover:underline"
                      href={`/dashboard/users/${event.user.id}`}
                    >
                      {event.user.fullName}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      ({event.user.email})
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
