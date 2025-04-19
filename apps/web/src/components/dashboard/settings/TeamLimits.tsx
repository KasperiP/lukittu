import { ITeamGetSuccessResponse } from '@/app/api/(dashboard)/teams/[slug]/route';
import { DateConverter } from '@/components/shared/DateConverter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { bytesToMb } from '@/lib/utils/number-helpers';
import { AuthContext } from '@/providers/AuthProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { Clock, CreditCard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useContext } from 'react';

interface TeamLimitsProps {
  team: ITeamGetSuccessResponse['team'] | null;
}

export default function TeamLimits({ team }: TeamLimitsProps) {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);
  const authCtx = useContext(AuthContext);

  const selectedTeam = teamCtx.teams.find(
    (team) => team.id === teamCtx.selectedTeam,
  );

  const hasActiveSubscription = selectedTeam?.subscription?.status === 'active';

  const isTeamOwner = selectedTeam?.ownerId === authCtx.session?.user.id;

  const limits = [
    {
      name: t('dashboard.navigation.licenses'),
      current: team?.counts.licenseCount ?? 0,
      max: team?.limits.maxLicenses ?? 1,
    },
    {
      name: t('dashboard.navigation.products'),
      current: team?.counts.productCount ?? 0,
      max: team?.limits.maxProducts ?? 1,
    },
    {
      name: t('dashboard.navigation.customers'),
      current: team?.counts.customerCount ?? 0,
      max: team?.limits.maxCustomers ?? 1,
    },
    {
      name: t('dashboard.navigation.members'),
      current: team?.counts.memberCount ?? 0,
      max: team?.limits.maxTeamMembers ?? 1,
    },
    {
      name: t('dashboard.settings.total_storage_used'),
      current: bytesToMb(team?.totalStorageUsed ?? 0),
      max: team?.limits.maxStorage ?? 1,
      unit: 'MB',
      isPro: true,
    },
  ];

  const handleSubscriptionManagement = async () => {
    window.location.href = '/api/billing/subscription-management';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center text-xl font-bold">
          {t('dashboard.settings.limits')}
        </CardTitle>
        <CardDescription>
          {t('dashboard.settings.limits_description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {limits.map((limit) => (
          <div key={limit.name} className="space-y-1">
            <div className="flex justify-between text-sm">
              <div className="flex items-center gap-2">
                <span>{limit.name}</span>
                {limit.isPro && (
                  <Badge className="text-xs" variant="primary">
                    PRO
                  </Badge>
                )}
              </div>
              <span>
                {limit.current} / {limit.max} {limit.unit ?? ''}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary"
                style={{ width: `${(limit.current / limit.max) * 100}%` }}
              />
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center">
            <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {t('dashboard.settings.log_retention')}
            </span>
          </div>
          <span className="text-sm">
            {team?.limits.logRetention ?? 0} {t('general.days')}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {t('general.classloader')}
            </span>
            <Badge className="text-xs" variant="primary">
              PRO
            </Badge>
          </div>
          <span className="text-sm">
            {team?.limits.allowClassloader
              ? t('general.enabled')
              : t('general.disabled')}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {t('general.custom_emails')}
            </span>
            <Badge className="text-xs" variant="primary">
              PRO
            </Badge>
          </div>
          <span className="text-sm">
            {team?.limits.allowCustomEmails
              ? t('general.enabled')
              : t('general.disabled')}
          </span>
        </div>
        {hasActiveSubscription && team?.subscription && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('general.plan')}</span>
              <span className="text-sm">{team.subscription.plan}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {t('general.billing_period_ends')}
              </span>
              <span className="text-sm">
                <DateConverter
                  date={team.subscription.billingPeriodEndsAt ?? new Date(0)}
                  displayType="date"
                />
              </span>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-4">
        <p className="text-sm text-muted-foreground">
          {t.rich('dashboard.settings.need_increased_limits', {
            emailElement: (children) => (
              <Link
                className="font-semibold text-primary"
                href="mailto:support@lukittu.com"
              >
                {children}
              </Link>
            ),
          })}
        </p>
        <TooltipProvider>
          <Tooltip delayDuration={50}>
            <TooltipTrigger asChild>
              <div className="w-full">
                <Button
                  className="flex items-center gap-2"
                  disabled={!isTeamOwner}
                  size="sm"
                  onClick={handleSubscriptionManagement}
                >
                  <CreditCard className="h-5 w-5" />
                  {t('dashboard.subscriptions.manage_subscription')}
                </Button>
              </div>
            </TooltipTrigger>
            {!isTeamOwner && (
              <TooltipContent>
                {t('dashboard.members.only_for_owners')}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </CardFooter>
    </Card>
  );
}
