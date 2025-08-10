import {
  IWebhookStatsGetResponse,
  IWebhookStatsGetSuccessResponse,
} from '@/app/api/(dashboard)/webhooks/[slug]/stats/route';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TeamContext } from '@/providers/TeamProvider';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useContext, useEffect } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { toast } from 'sonner';
import useSWR from 'swr';

const fetchWebhookStats = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IWebhookStatsGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

interface WebhookStatsChartProps {
  webhookId: string;
}

export function WebhookStatsChart({ webhookId }: WebhookStatsChartProps) {
  const t = useTranslations();
  const locale = useLocale();
  const teamCtx = useContext(TeamContext);

  const { data, error, isLoading } = useSWR<IWebhookStatsGetSuccessResponse>(
    teamCtx.selectedTeam
      ? [`/api/webhooks/${webhookId}/stats`, teamCtx.selectedTeam]
      : null,
    ([url]) => fetchWebhookStats(url),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const chartData =
    data?.dailyStats
      ?.slice()
      .reverse()
      .map((stat) => ({
        ...stat,
        date: new Date(stat.date).toISOString(),
      })) ?? [];

  const chartConfig = {
    delivered: {
      label: t('general.delivered'),
      color: 'hsl(var(--chart-1))',
    },
    failed: {
      label: t('general.failed'),
      color: 'hsl(var(--chart-5))',
    },
    pending: {
      label: t('general.pending'),
      color: 'hsl(var(--chart-3))',
    },
  } satisfies ChartConfig;

  return (
    <>
      {/* Summary Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('general.total_events')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                (data?.summary.totalEvents.toLocaleString() ?? 0)
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('general.delivered')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                (data?.summary.deliveredEvents.toLocaleString() ?? 0)
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('general.failed')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                (data?.summary.failedEvents.toLocaleString() ?? 0)
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('general.delivery_rate')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                `${data?.summary.deliveryRate ?? 0}%`
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="flex flex-col border-b py-5 sm:flex-row sm:items-center">
          <div className="grid gap-1">
            <CardTitle className="text-xl">
              {t('dashboard.webhooks.event_delivery_trends')}
            </CardTitle>
            <CardDescription>
              {t('dashboard.webhooks.event_delivery_trends_description')}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ChartContainer
              className="aspect-auto h-[250px] w-full"
              config={chartConfig}
            >
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient
                    id="fillDelivered"
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-delivered)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-delivered)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient id="fillFailed" x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-failed)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-failed)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient id="fillPending" x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-pending)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-pending)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  minTickGap={32}
                  tickFormatter={(value) => {
                    const date = new Date(new Date(value).setHours(0, 0, 0, 0));
                    return date.toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                    });
                  }}
                  tickLine={false}
                  tickMargin={8}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      labelFormatter={(value) => {
                        const date = new Date(value);
                        return date.toLocaleDateString(locale, {
                          month: 'short',
                          day: 'numeric',
                        });
                      }}
                    />
                  }
                  cursor={false}
                />
                <Area
                  dataKey="delivered"
                  fill="url(#fillDelivered)"
                  stackId="a"
                  stroke="var(--color-delivered)"
                  type="monotone"
                />
                <Area
                  dataKey="failed"
                  fill="url(#fillFailed)"
                  stackId="a"
                  stroke="var(--color-failed)"
                  type="monotone"
                />
                <Area
                  dataKey="pending"
                  fill="url(#fillPending)"
                  stackId="a"
                  stroke="var(--color-pending)"
                  type="monotone"
                />
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
        <CardFooter>
          <div className="flex w-full items-start gap-2 text-sm">
            <div className="grid gap-2">
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-pointer items-center gap-2 font-medium leading-none underline">
                      {data?.summary.deliveryRate ? (
                        data.summary.deliveryRate >= 95 ? (
                          <>
                            {t('dashboard.webhooks.excellent_delivery_rate', {
                              rate: data.summary.deliveryRate.toString(),
                            })}
                            <TrendingUp className="h-4 w-4" />
                          </>
                        ) : data.summary.deliveryRate >= 80 ? (
                          <>
                            {t('dashboard.webhooks.good_delivery_rate', {
                              rate: data.summary.deliveryRate.toString(),
                            })}
                            <TrendingUp className="h-4 w-4" />
                          </>
                        ) : (
                          <>
                            {t('dashboard.webhooks.poor_delivery_rate', {
                              rate: data.summary.deliveryRate.toString(),
                            })}
                            <TrendingDown className="h-4 w-4" />
                          </>
                        )
                      ) : (
                        <>
                          {t('dashboard.webhooks.no_delivery_data')}
                          <TrendingUp className="h-4 w-4" />
                        </>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="flex max-w-sm">
                      {t('dashboard.webhooks.delivery_rate_tooltip')}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardFooter>
      </Card>
    </>
  );
}
