/* eslint-disable lines-around-comment */
'use client';
import {
  IStatisticsMapDataGetResponse,
  IStatisticsMapDataGetSuccessResponse,
} from '@/app/api/(dashboard)/statistics/map-data/route';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import numberFormatter from '@/lib/utils/number-helpers';
import { cn } from '@/lib/utils/tailwind-helpers';
import { TeamContext } from '@/providers/TeamProvider';
import * as d3 from 'd3';
import { useTranslations } from 'next-intl';
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import * as topojson from 'topojson-client';
import worldJson from 'visionscarto-world-atlas/world/110m.json';
import { MapTooltip } from './WorldMapTooltip';

const width = 475;
const height = 335;

type CountryData = {
  alpha_3: string;
  name: string;
  requests: number;
};

type WorldJsonCountryData = { properties: { name: string; a3: string } };

interface WorldMapChartProps {
  licenseId?: string;
}

const fetchMapData = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IStatisticsMapDataGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function WorldMapChart({ licenseId }: WorldMapChartProps) {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);
  const [timeRange, setTimeRange] = useLocalStorageState(
    'world-map-time-range',
    '30d',
  );
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    hoveredCountryAlpha3Code: string | null;
  }>({ x: 0, y: 0, hoveredCountryAlpha3Code: null });

  const svgRef = useRef<SVGSVGElement | null>(null);

  const searchParams = new URLSearchParams({
    timeRange,
    ...(licenseId && { licenseId }),
  });

  const {
    data: response,
    error,
    isLoading,
  } = useSWR<IStatisticsMapDataGetSuccessResponse>(
    teamCtx.selectedTeam
      ? [
          '/api/statistics/map-data',
          teamCtx.selectedTeam,
          searchParams.toString(),
        ]
      : null,
    ([url, _, params]) => fetchMapData(`${url}?${params}`),
    {
      refreshInterval: 60 * 1000, // 60 seconds
    },
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.error_occurred'));
    }
  }, [error, t]);

  const labels = { singular: 'Request', plural: 'Requests' };

  const { maxValue, dataByCountryCode } = useMemo(() => {
    const dataByCountryCode: Map<string, CountryData> = new Map();
    let maxValue = 0;
    for (const { alpha_3, requests, name } of response?.data || []) {
      if (requests > maxValue) {
        maxValue = requests;
      }
      dataByCountryCode.set(alpha_3, { alpha_3, requests, name });
    }
    return { maxValue, dataByCountryCode };
  }, [response?.data]);

  useEffect(() => {
    if (!svgRef.current) {
      return;
    }

    const svg = drawInteractiveCountries(svgRef.current, setTooltip);

    return () => {
      svg.selectAll('*').remove();
    };
  }, []);

  useEffect(() => {
    if (svgRef.current) {
      const palette = ['#2e3954', '#2662d9'];

      const getColorForValue = d3
        .scaleLinear<string>()
        .domain([0, maxValue])
        .range(palette);

      colorInCountriesWithValues(
        svgRef.current,
        getColorForValue,
        dataByCountryCode,
      );
    }
  }, [maxValue, dataByCountryCode]);

  const hoveredCountryData = tooltip.hoveredCountryAlpha3Code
    ? dataByCountryCode.get(tooltip.hoveredCountryAlpha3Code)
    : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b py-5">
        <div className="grid flex-1 gap-1">
          <CardTitle className="text-xl">
            {t('dashboard.dashboard.requests_by_country')}
          </CardTitle>
          <CardDescription>
            {t('dashboard.dashboard.requests_by_country_description')}
          </CardDescription>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[160px] rounded-lg sm:ml-auto">
            <SelectValue placeholder={t('dashboard.dashboard.last_24_hours')} />
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
      </CardHeader>
      <CardContent className="relative flex-1 pb-0">
        <div
          className="relative flex h-full w-full flex-col"
          style={{ minHeight: 360 }}
        >
          <div className="mt-4" />
          <div
            className="relative mx-auto w-full"
            style={{ height, maxWidth: width }}
          >
            <svg
              ref={svgRef}
              className="w-full"
              viewBox={`0 0 ${width} ${height}`}
            />
            {!!hoveredCountryData && (
              <MapTooltip
                label={
                  labels[
                    hoveredCountryData.requests === 1 ? 'singular' : 'plural'
                  ]
                }
                name={hoveredCountryData.name}
                value={numberFormatter(hoveredCountryData.requests).toString()}
                x={tooltip.x}
                y={tooltip.y}
              />
            )}
          </div>
        </div>
        {isLoading && (
          <div className="absolute left-0 top-0 flex h-full w-full items-center justify-center bg-background bg-opacity-50">
            <LoadingSpinner size={42} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const sharedCountryClass = cn('transition-colors');

const countryClass = cn(
  sharedCountryClass,
  'stroke-1',
  'fill-[#f1f5f9]',
  'stroke-[#dae1e7]',
  'dark:fill-[#2d3747]',
  'dark:stroke-[#1f2937]',
);

const highlightedCountryClass = cn(
  sharedCountryClass,
  'stroke-2',
  'fill-[#f5f5f5]',
  'stroke-primary',
  'dark:fill-[#374151]',
);

function colorInCountriesWithValues(
  element: SVGSVGElement,
  getColorForValue: d3.ScaleLinear<string, string, never>,
  dataByCountryCode: Map<string, CountryData>,
) {
  function getCountryByCountryPath(countryPath: unknown) {
    return dataByCountryCode.get(
      (countryPath as unknown as WorldJsonCountryData).properties.a3,
    );
  }

  const svg = d3.select(element);

  return svg
    .selectAll('path')
    .style('fill', (countryPath) => {
      const country = getCountryByCountryPath(countryPath);
      if (!country?.requests) {
        return null;
      }
      return getColorForValue(country.requests);
    })
    .style('cursor', (countryPath) => {
      const country = getCountryByCountryPath(countryPath);
      if (!country?.requests) {
        return null;
      }
      return 'pointer';
    });
}

function drawInteractiveCountries(
  element: SVGSVGElement,
  setTooltip: React.Dispatch<
    React.SetStateAction<{
      x: number;
      y: number;
      hoveredCountryAlpha3Code: string | null;
    }>
  >,
) {
  const path = setupProjetionPath();
  const data = parseWorldTopoJsonToGeoJsonFeatures();
  const svg = d3.select(element);

  svg
    .selectAll('path')
    .data(data)
    .enter()
    .append('path')
    .attr('class', countryClass)
    .attr('d', path as never)

    .on('mouseover', function (event, country) {
      const [x, y] = d3.pointer(event, svg.node()?.parentNode);
      setTooltip({ x, y, hoveredCountryAlpha3Code: country.properties.a3 });

      this.parentNode?.appendChild(this);
      d3.select(this).attr('class', highlightedCountryClass);
    })

    .on('mousemove', function (event) {
      const [x, y] = d3.pointer(event, svg.node()?.parentNode);
      setTooltip((currentState) => ({ ...currentState, x, y }));
    })

    .on('mouseout', function () {
      setTooltip({ x: 0, y: 0, hoveredCountryAlpha3Code: null });
      d3.select(this).attr('class', countryClass);
    });

  return svg;
}

function setupProjetionPath() {
  const projection = d3
    .geoMercator()
    .scale(75)
    .translate([width / 2, height / 1.5]);

  const path = d3.geoPath().projection(projection);
  return path;
}

function parseWorldTopoJsonToGeoJsonFeatures(): Array<WorldJsonCountryData> {
  const collection = topojson.feature(
    // @ts-expect-error strings in worldJson not recongizable as the enum values declared in library
    worldJson,
    worldJson.objects.countries,
  );

  // @ts-expect-error topojson.feature return type incorrectly inferred as not a collection
  return collection.features;
}
