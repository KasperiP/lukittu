'use client';
import {
  IStatisticsRequestsGetResponse,
  IStatisticsRequestsGetSuccessResponse,
} from '@/app/api/(dashboard)/statistics/requests/route';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { TeamContext } from '@/providers/TeamProvider';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useContext, useEffect } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { toast } from 'sonner';
import useSWR from 'swr';

const initialData = Array.from({ length: 24 }, (_, index) => {
  const date = new Date();
  date.setHours(date.getHours() - 23 + index, 0, 0, 0);

  return {
    date: date.toISOString(),
    total: 0,
    success: 0,
    failed: 0,
  };
});

const fetchRequests = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IStatisticsRequestsGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

interface RequestsAreaChartProps {
  licenseId?: string;
}

export function RequestsAreaChart({ licenseId }: RequestsAreaChartProps) {
  const t = useTranslations();
  const locale = useLocale();
  const teamCtx = useContext(TeamContext);

  const [timeRange, setTimeRange] = useLocalStorageState(
    'requests-time-range',
    '24h',
  );
  const [typeFilter, setTypeFilter] = useLocalStorageState(
    'requests-type-filter',
    'VERIFY',
  );

  const { data: response, error } =
    useSWR<IStatisticsRequestsGetSuccessResponse>(
      teamCtx.selectedTeam
        ? [
            `/api/statistics/requests?timeRange=${timeRange}${
              typeFilter !== 'all' ? `&type=${typeFilter}` : ''
            }${licenseId ? `&licenseId=${licenseId}` : ''}`,
            teamCtx.selectedTeam,
          ]
        : null,
      ([url]) => fetchRequests(url),
      {
        refreshInterval: 30 * 1000, // 30 seconds
      },
    );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.error_occurred'));
    }
  }, [error, t]);

  const chartConfig = {
    total: {
      label: t('dashboard.dashboard.total'),
    },
    success: {
      label: t('dashboard.dashboard.success'),
      color: 'hsl(var(--chart-1))',
    },
    failed: {
      label: t('dashboard.dashboard.failed'),
      color: 'hsl(var(--chart-5))',
    },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader className="flex flex-col border-b py-5 sm:flex-row sm:items-center">
        <div className="grid gap-1">
          <CardTitle className="text-xl">
            {t('dashboard.dashboard.requests')}
          </CardTitle>
          <CardDescription>
            {t('dashboard.dashboard.requests_description')}
          </CardDescription>
        </div>
        <div className="mt-4 flex w-full flex-col gap-2 sm:ml-auto sm:mt-0 sm:w-auto sm:flex-row">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full rounded-lg sm:w-[140px]">
              <SelectValue placeholder={t('general.all')} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem className="rounded-lg" value="all">
                {t('general.all')}
              </SelectItem>
              <SelectItem className="rounded-lg" value="HEARTBEAT">
                {t('general.heartbeat')}
              </SelectItem>
              <SelectItem className="rounded-lg" value="VERIFY">
                {t('general.verify')}
              </SelectItem>
              <SelectItem className="rounded-lg" value="DOWNLOAD">
                {t('general.classloader')}
              </SelectItem>
            </SelectContent>
          </Select>

          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-full rounded-lg sm:w-[140px]">
              <SelectValue
                placeholder={t('dashboard.dashboard.last_24_hours')}
              />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem className="rounded-lg" value="1h">
                {t('dashboard.dashboard.last_hour')}
              </SelectItem>
              <SelectItem className="rounded-lg" value="24h">
                {t('dashboard.dashboard.last_24_hours')}
              </SelectItem>
              <SelectItem className="rounded-lg" value="7d">
                {t('dashboard.dashboard.last_7_days')}
              </SelectItem>
              <SelectItem className="rounded-lg" value="30d">
                {t('dashboard.dashboard.last_30_days')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          className="aspect-auto h-[250px] w-full"
          config={chartConfig}
        >
          <AreaChart data={response?.data ?? initialData}>
            <defs>
              <linearGradient id="fillSuccess" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-success)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-success)"
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
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="date"
              minTickGap={32}
              tickFormatter={(value) => {
                if (timeRange === '1h') {
                  const date = new Date(new Date(value).setSeconds(0, 0));
                  return date.toLocaleTimeString(locale, {
                    hour: 'numeric',
                    minute: 'numeric',
                  });
                }

                if (timeRange !== '24h') {
                  const date = new Date(new Date(value).setHours(0, 0, 0, 0));
                  return date.toLocaleDateString(locale, {
                    month: 'short',
                    day: 'numeric',
                  });
                }

                const date = new Date(new Date(value).setMinutes(0, 0, 0));
                return date.toLocaleTimeString(locale, {
                  hour: 'numeric',
                  minute: 'numeric',
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
                    if (timeRange === '1h') {
                      const date = new Date(value);
                      return date.toLocaleTimeString(locale, {
                        hour: 'numeric',
                        minute: 'numeric',
                      });
                    }

                    if (timeRange === '30d' || timeRange === '7d') {
                      const date = new Date(value);
                      return date.toLocaleDateString(locale, {
                        month: 'short',
                        day: 'numeric',
                      });
                    }

                    const date = new Date(value);
                    return date.toLocaleTimeString(locale, {
                      hour: 'numeric',
                      minute: 'numeric',
                    });
                  }}
                />
              }
              cursor={false}
            />
            <Area
              dataKey="success"
              fill="url(#fillSuccess)"
              stackId="b"
              stroke="var(--color-success)"
              type="monotone"
            />
            <Area
              dataKey="failed"
              fill="url(#fillFailed)"
              stackId="a"
              stroke="var(--color-failed)"
              type="monotone"
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
      <CardFooter>
        <div className="flex w-full items-start gap-2 text-sm">
          <div className="grid gap-2">
            <TooltipProvider>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div className="flex cursor-pointer items-center gap-2 font-medium leading-none underline">
                    {response?.comparedToPrevious.includes('-') ? (
                      <>
                        {t('dashboard.dashboard.trending_down')}{' '}
                        {response.comparedToPrevious}{' '}
                        {t('dashboard.dashboard.compared_to_last_period')}
                        <TrendingDown className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        {t('dashboard.dashboard.trending_up')}{' '}
                        {response?.comparedToPrevious}{' '}
                        {t('dashboard.dashboard.compared_to_last_period')}
                        <TrendingUp className="h-4 w-4" />
                      </>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex max-w-sm">
                    {t('dashboard.dashboard.last_period_description')}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
