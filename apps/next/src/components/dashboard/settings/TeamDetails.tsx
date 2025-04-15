import { ITeamGetSuccessResponse } from '@/app/api/(dashboard)/teams/[slug]/route';
import { DateConverter } from '@/components/shared/DateConverter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CheckCircle2, Copy, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface TeamDetailsProps {
  team: ITeamGetSuccessResponse['team'] | null;
}

export function TeamDetails({ team }: TeamDetailsProps) {
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
              {team ? (
                <span className="flex items-center gap-2">
                  <Copy className="h-4 w-4 shrink-0" />
                  <TooltipProvider>
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <span
                          className="truncate text-primary hover:underline"
                          role="button"
                          onClick={() => {
                            navigator.clipboard.writeText(team.id);
                            toast.success(t('general.copied_to_clipboard'));
                          }}
                        >
                          {team.id}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('general.click_to_copy')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
              ) : (
                <Skeleton className="h-4 w-full" />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('general.name')}</h3>
            <div className="text-sm text-muted-foreground">
              {team?.name ? team.name : <Skeleton className="h-4 w-full" />}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              {t('dashboard.navigation.members')}
            </h3>
            <div className="text-sm text-muted-foreground">
              {team?.counts.memberCount ? (
                team.counts.memberCount
              ) : (
                <Skeleton className="h-4 w-full" />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('general.owner')}</h3>
            <div className="text-sm text-muted-foreground">
              {team?.owner ? (
                team.owner.email
              ) : (
                <Skeleton className="h-4 w-full" />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              {t('general.subscription')}
            </h3>
            <div className="text-sm text-muted-foreground">
              {team ? (
                team.subscription?.status === 'active' ? (
                  <Badge className="text-xs" variant="success">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    {t('general.active')}
                  </Badge>
                ) : (
                  <Badge className="text-xs" variant="secondary">
                    <XCircle className="mr-1 h-3 w-3" />
                    {t('general.inactive')}
                  </Badge>
                )
              ) : (
                <Skeleton className="h-4 w-full" />
              )}
            </div>
          </div>

          {team?.subscription?.status === 'active' && (
            <>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{t('general.plan')}</h3>
                <div className="text-sm text-muted-foreground">
                  {team.subscription.plan}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {t('general.billing_period_ends')}
                </h3>
                <div className="text-sm text-muted-foreground">
                  <DateConverter
                    date={
                      team.subscription.billingPeriodEndsAt
                        ? new Date(team.subscription.billingPeriodEndsAt)
                        : new Date(0)
                    }
                  />
                </div>
              </div>
            </>
          )}

          {showMore && (
            <>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {t('general.created_at')}
                </h3>
                <div className="text-sm text-muted-foreground">
                  {team ? (
                    <DateConverter date={team.createdAt} />
                  ) : (
                    <Skeleton className="h-4 w-full" />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {t('general.updated_at')}
                </h3>
                <div className="text-sm text-muted-foreground">
                  {team ? (
                    <DateConverter date={team.updatedAt} />
                  ) : (
                    <Skeleton className="h-4 w-full" />
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
