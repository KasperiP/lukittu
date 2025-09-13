import { DateConverter } from '@/components/shared/DateConverter';
import { ClickableIdentifier } from '@/components/shared/misc/ClickableIdentifier';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { User, Webhook } from '@lukittu/shared';
import { CheckCircle, User as UserIcon, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

interface WebhookDetailsProps {
  webhook:
    | (Webhook & {
        createdBy: Omit<User, 'passwordHash'> | null;
      })
    | null;
}

export function WebhookDetails({ webhook }: WebhookDetailsProps) {
  const [showMore, setShowMore] = useState(false);
  const t = useTranslations();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b py-5">
        <CardTitle className="flex items-center text-xl font-bold">
          {t('general.details')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">ID</h3>
            <div className="text-sm font-semibold">
              {webhook ? (
                <ClickableIdentifier
                  className="font-mono text-xs"
                  value={webhook.id}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 shrink-0" />
                  <Skeleton className="h-4 w-48" />
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              {t('dashboard.integrations.webhook_secret')}
            </h3>
            <div className="text-sm font-semibold">
              {webhook ? (
                <ClickableIdentifier
                  className="font-mono text-xs"
                  value={webhook.secret}
                >
                  {`${webhook.secret.substring(0, 6)}${'•'.repeat(webhook.secret.length - 6)}`}
                </ClickableIdentifier>
              ) : (
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 shrink-0" />
                  <Skeleton className="h-4 w-32" />
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('general.status')}</h3>
            <div className="text-sm text-muted-foreground">
              {webhook ? (
                <Badge
                  className="text-xs"
                  variant={webhook.active ? 'success' : 'error'}
                >
                  {webhook.active ? (
                    <CheckCircle className="mr-1 h-3 w-3" />
                  ) : (
                    <XCircle className="mr-1 h-3 w-3" />
                  )}
                  {webhook.active ? t('general.active') : t('general.inactive')}
                </Badge>
              ) : (
                <Skeleton className="h-5 w-16" />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('general.url')}</h3>
            <div className="text-sm text-muted-foreground">
              {webhook ? (
                <span className="break-all">{webhook.url}</span>
              ) : (
                <Skeleton className="h-4 w-full" />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              {t('dashboard.webhooks.enabled_events')}
            </h3>
            <div className="text-sm text-muted-foreground">
              {webhook ? (
                webhook.enabledEvents.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {webhook.enabledEvents.map((event) => (
                      <Badge key={event} className="text-xs" variant="outline">
                        {event}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  'None'
                )
              ) : (
                <div className="flex flex-wrap gap-1">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-14" />
                </div>
              )}
            </div>
          </div>
          {showMore && (
            <>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {t('general.created_at')}
                </h3>
                <div className="text-sm text-muted-foreground">
                  {webhook ? (
                    <DateConverter date={webhook.createdAt} />
                  ) : (
                    <Skeleton className="h-4 w-28" />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {t('general.updated_at')}
                </h3>
                <div className="text-sm text-muted-foreground">
                  {webhook ? (
                    <DateConverter date={webhook.updatedAt} />
                  ) : (
                    <Skeleton className="h-4 w-28" />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {t('general.created_by')}
                </h3>
                <div className="text-sm font-semibold">
                  {webhook ? (
                    webhook.createdBy ? (
                      <span className="flex items-center gap-2">
                        <UserIcon className="h-4 w-4 shrink-0" />
                        <Link
                          className="text-primary hover:underline"
                          href={`/dashboard/team/members?memberId=${webhook.createdBy.id}`}
                        >
                          {webhook.createdBy.fullName}
                        </Link>
                      </span>
                    ) : (
                      t('general.unknown')
                    )
                  ) : (
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 shrink-0" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <Button
          className="mt-2 px-0"
          size="sm"
          variant="link"
          onClick={() => setShowMore(!showMore)}
        >
          {showMore ? t('general.show_less') : t('general.show_more')}
        </Button>
      </CardContent>
    </Card>
  );
}
