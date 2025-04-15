import { regex } from '@/lib/constants/regex';
import { logger } from '@/lib/logging/logger';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { Prisma } from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type RequestData = {
  date: string;
  total: number;
  success: number;
  failed: number;
};

export type IStatisticsRequestsGetSuccessResponse = {
  data: RequestData[];
  comparedToPrevious: string;
};

export type IStatisticsRequestsGetResponse =
  | ErrorResponse
  | IStatisticsRequestsGetSuccessResponse;

const allowedTimeRanges = ['1h', '24h', '7d', '30d'] as const;
const allowedTypes = ['VERIFY', 'DOWNLOAD', 'HEARTBEAT'];

const getStartDate = (timeRange: '1h' | '24h' | '7d' | '30d') => {
  const now = new Date();
  switch (timeRange) {
    case '1h':
      return new Date(now.setHours(now.getHours() - 1 * 2));
    case '24h':
      return new Date(now.setHours(now.getHours() - 24 * 2));
    case '7d':
      return new Date(now.setDate(now.getDate() - 7 * 2));
    case '30d':
      return new Date(now.setDate(now.getDate() - 30 * 2));
    default:
      return new Date(now.setHours(now.getHours() - 24 * 2));
  }
};

const groupByDateOrHour = (
  data: any[],
  timeRange: '1h' | '24h' | '7d' | '30d',
) => {
  const getKey = (date: Date) => {
    if (timeRange === '1h') return date.getUTCMinutes();
    if (timeRange === '24h') return date.getUTCHours();
    return date.toISOString().split('T')[0];
  };

  return data.reduce(
    (acc, item) => {
      const date = new Date(item.createdAt);
      const key = getKey(date);

      if (!acc[key]) {
        acc[key] = { total: 0, success: 0, failed: 0 };
      }

      acc[key].total += 1;
      if (item.status === 'VALID') {
        acc[key].success += 1;
      } else {
        acc[key].failed += 1;
      }

      return acc;
    },
    {} as Record<
      string | number,
      { total: number; success: number; failed: number }
    >,
  );
};

export async function GET(
  request: NextRequest,
): Promise<NextResponse<IStatisticsRequestsGetResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });
  const searchParams = request.nextUrl.searchParams;

  const licenseId = searchParams.get('licenseId');
  const type = searchParams.get('type') as string;

  if (type && !allowedTypes.includes(type)) {
    return NextResponse.json(
      {
        message: t('validation.bad_request'),
      },
      { status: HttpStatus.BAD_REQUEST },
    );
  }

  let timeRange = searchParams.get('timeRange') as
    | '1h'
    | '24h'
    | '7d'
    | '30d'
    | null;
  if (!timeRange || !allowedTimeRanges.includes(timeRange)) {
    timeRange = '24h';
  }

  if (licenseId && !regex.uuidV4.test(licenseId)) {
    return NextResponse.json(
      {
        message: t('validation.bad_request'),
      },
      { status: HttpStatus.BAD_REQUEST },
    );
  }

  try {
    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        { message: t('validation.team_not_found') },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              id: selectedTeam,
              deletedAt: null,
            },
            include: {
              requestLogs: {
                where: {
                  licenseId: licenseId ? licenseId : undefined,
                  type: type ? type : undefined,
                  createdAt: {
                    gte: getStartDate(timeRange),
                  },
                } as Prisma.RequestLogWhereInput,
                select: {
                  createdAt: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { message: t('validation.unauthorized') },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (!session.user.teams.length) {
      return NextResponse.json(
        { message: t('validation.team_not_found') },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const requestLogs = session.user.teams[0].requestLogs;

    const filteredData = requestLogs
      .filter((log) => {
        if (timeRange === '1h') {
          return (
            new Date(log.createdAt).getTime() >
            new Date().setHours(new Date().getHours() - 1)
          );
        }

        if (timeRange === '24h') {
          return (
            new Date(log.createdAt).getTime() >
            new Date().setHours(new Date().getHours() - 23)
          );
        }

        if (timeRange === '7d') {
          return (
            new Date(log.createdAt).getTime() >
            new Date().setDate(new Date().getDate() - 7)
          );
        }

        return (
          new Date(log.createdAt).getTime() >
          new Date().setDate(new Date().getDate() - 30)
        );
      })
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

    const currentDayTotal = filteredData.length;
    const previousDayTotal = requestLogs.length - currentDayTotal;

    const comparedToPrevious =
      previousDayTotal === 0
        ? '0%'
        : `${Math.round(
            ((currentDayTotal - previousDayTotal) / previousDayTotal) * 100,
          )}%`;

    const groupedData = groupByDateOrHour(filteredData, timeRange);

    const data = [];

    if (timeRange === '1h') {
      const currentMinute = new Date().getMinutes();
      const startDate = new Date(
        new Date().setMinutes(currentMinute - (60 - 1), 0, 0),
      );

      for (let m = 0; m < 60; m++) {
        const date = new Date(startDate);
        date.setMinutes(date.getMinutes() + m);
        const minuteKey = date.getUTCMinutes();

        data.push({
          date: date.toISOString(),
          total: groupedData[minuteKey]?.total || 0,
          success: groupedData[minuteKey]?.success || 0,
          failed: groupedData[minuteKey]?.failed || 0,
        });
      }
    } else if (timeRange === '24h') {
      const currentHour = new Date().getHours();
      const startDate = new Date(
        new Date().setHours(currentHour - (24 - 1), 0, 0, 0),
      );

      for (let h = 0; h < 24; h++) {
        const date = new Date(startDate);
        date.setHours(date.getHours() + h);
        const hourKey = date.getUTCHours();

        data.push({
          date: date.toISOString(),
          total: groupedData[hourKey]?.total || 0,
          success: groupedData[hourKey]?.success || 0,
          failed: groupedData[hourKey]?.failed || 0,
        });
      }
    } else {
      const startDate = new Date(
        new Date().setDate(
          new Date().getDate() - (timeRange === '7d' ? 7 : 30),
        ),
      );
      const endDate = new Date();

      for (
        let d = new Date(startDate);
        d <= endDate;
        d.setDate(d.getDate() + 1)
      ) {
        const date = d.toISOString().split('T')[0];
        data.push({
          date,
          total: groupedData[date]?.total || 0,
          success: groupedData[date]?.success || 0,
          failed: groupedData[date]?.failed || 0,
        });
      }
    }

    return NextResponse.json({
      data,
      comparedToPrevious,
    });
  } catch (error) {
    logger.error("Error occurred in 'dashboard/requests' route", error);
    return NextResponse.json(
      { message: t('general.server_error') },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
