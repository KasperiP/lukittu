'use client';
import {
  IStatisticsProductDivisionGetResponse,
  IStatisticsProductDivisionGetSuccessResponse,
} from '@/app/api/(dashboard)/statistics/product-division/route';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import {
  Card,
  CardContent,
  CardDescription,
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
import { TeamContext } from '@/providers/TeamProvider';
import { Frown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useEffect } from 'react';
import { Label, Pie, PieChart } from 'recharts';
import { toast } from 'sonner';
import useSWR from 'swr';

interface RenderLabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  index: number;
}

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: RenderLabelProps) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      dominantBaseline="central"
      fill="white"
      textAnchor={x > cx ? 'start' : 'end'}
      x={x}
      y={y}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const fetchProductDivision = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IStatisticsProductDivisionGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export function ProductDivisionPieChart() {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);

  const {
    data: response,
    error,
    isLoading,
  } = useSWR<IStatisticsProductDivisionGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/statistics/product-division', teamCtx.selectedTeam]
      : null,
    ([url]) => fetchProductDivision(url),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.error_occurred'));
    }
  }, [error, t]);

  const chartData =
    response?.data.map(({ name, licenses, id }) => ({
      id,
      name,
      licenses,
      fill: `var(--color-${id})`,
    })) ?? [];

  const chartConfig = chartData.reduce<ChartConfig>(
    (acc, { name, id }, index) => {
      acc[id] = {
        label: name,
        color: `hsl(var(--chart-${(index % 5) + 1}))`,
      };
      return acc;
    },
    {},
  );

  const total = chartData.reduce((acc, { licenses }) => acc + licenses, 0);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b py-5">
        <div className="grid flex-1 gap-1">
          <CardTitle className="text-xl">
            {t('dashboard.dashboard.product_division')}
          </CardTitle>
          <CardDescription>
            {t('dashboard.dashboard.product_division_description')}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="relative flex-1 pb-0">
        {isLoading && (
          <div className="absolute left-0 top-0 flex h-full w-full items-center justify-center rounded-lg bg-background">
            <LoadingSpinner className="h-10 w-10" />
          </div>
        )}
        {total === 0 ? (
          <div className="mx-auto flex aspect-square max-h-[300px] items-center justify-center">
            <div className="text-center">
              <Frown className="mx-auto h-12 w-12" />
              <p className="mt-4 text-lg font-semibold">
                {t('general.no_data')}
              </p>
            </div>
          </div>
        ) : (
          <ChartContainer
            className="mx-auto aspect-square max-h-[300px]"
            config={chartConfig}
          >
            <PieChart>
              <ChartTooltip
                content={<ChartTooltipContent hideLabel />}
                cursor={false}
              />
              <Pie
                data={chartData}
                dataKey="licenses"
                innerRadius={70}
                label={renderCustomizedLabel}
                labelLine={false}
                nameKey="name"
                strokeWidth={5}
              >
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                      return (
                        <text
                          dominantBaseline="middle"
                          textAnchor="middle"
                          x={viewBox.cx}
                          y={viewBox.cy}
                        >
                          <tspan
                            className="fill-foreground text-3xl font-bold"
                            x={viewBox.cx}
                            y={viewBox.cy}
                          >
                            {total}
                          </tspan>
                          <tspan
                            className="fill-muted-foreground"
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 24}
                          >
                            {t('dashboard.navigation.licenses')}
                          </tspan>
                        </text>
                      );
                    }
                  }}
                />
              </Pie>
              <ChartLegend
                className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
                content={<ChartLegendContent nameKey="id" />}
              />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
