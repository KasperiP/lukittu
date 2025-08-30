import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma, Prisma, regex, RequestType } from '@lukittu/shared';
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
const allowedTypes = Object.values(RequestType);

const getStartDate = (timeRange: '1h' | '24h' | '7d' | '30d') => {
  const now = new Date();
  switch (timeRange) {
    case '1h':
      return new Date(now.getTime() - 60 * 60 * 1000);
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
};

const getPreviousStartDate = (timeRange: '1h' | '24h' | '7d' | '30d') => {
  const now = new Date();
  switch (timeRange) {
    case '1h':
      return new Date(now.getTime() - 2 * 60 * 60 * 1000);
    case '24h':
      return new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 2 * 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 2 * 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  }
};

const getDateTruncateExpression = (timeRange: '1h' | '24h' | '7d' | '30d') => {
  switch (timeRange) {
    case '1h':
      return 'date_trunc(\'minute\', "createdAt")';
    case '24h':
      return 'date_trunc(\'hour\', "createdAt")';
    case '7d':
    case '30d':
      return 'date_trunc(\'day\', "createdAt")';
    default:
      return 'date_trunc(\'hour\', "createdAt")';
  }
};

const generateTimeSeriesData = (
  timeRange: '1h' | '24h' | '7d' | '30d',
  aggregatedData: Record<
    string,
    { total: number; success: number; failed: number }
  >,
) => {
  const data: RequestData[] = [];
  const now = new Date();

  if (timeRange === '1h') {
    const startTime = new Date(now.getTime() - 60 * 60 * 1000);
    for (let i = 0; i < 60; i++) {
      const time = new Date(startTime.getTime() + i * 60 * 1000);
      const key = time.toISOString().substring(0, 16) + ':00.000Z';
      data.push({
        date: time.toISOString(),
        total: aggregatedData[key]?.total || 0,
        success: aggregatedData[key]?.success || 0,
        failed: aggregatedData[key]?.failed || 0,
      });
    }
  } else if (timeRange === '24h') {
    const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    for (let i = 0; i < 24; i++) {
      const time = new Date(startTime.getTime() + i * 60 * 60 * 1000);
      const key = time.toISOString().substring(0, 13) + ':00:00.000Z';
      data.push({
        date: time.toISOString(),
        total: aggregatedData[key]?.total || 0,
        success: aggregatedData[key]?.success || 0,
        failed: aggregatedData[key]?.failed || 0,
      });
    }
  } else {
    const days = timeRange === '7d' ? 7 : 30;
    const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    for (let i = 0; i < days; i++) {
      const time = new Date(startTime.getTime() + i * 24 * 60 * 60 * 1000);
      const key = time.toISOString().substring(0, 10) + 'T00:00:00.000Z';
      data.push({
        date: time.toISOString().split('T')[0],
        total: aggregatedData[key]?.total || 0,
        success: aggregatedData[key]?.success || 0,
        failed: aggregatedData[key]?.failed || 0,
      });
    }
  }

  return data;
};

export async function GET(
  request: NextRequest,
): Promise<NextResponse<IStatisticsRequestsGetResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });
  const searchParams = request.nextUrl.searchParams;

  const licenseId = searchParams.get('licenseId');
  const type = searchParams.get('type');

  if (type && !allowedTypes.includes(type as RequestType)) {
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

    const startDate = getStartDate(timeRange);
    const previousStartDate = getPreviousStartDate(timeRange);
    const dateTruncExpression = getDateTruncateExpression(timeRange);

    const whereConditions: Prisma.Sql[] = [
      Prisma.sql`"teamId" = ${selectedTeam}`,
    ];

    if (licenseId) {
      const licenseExists = await prisma.license.findUnique({
        where: { id: licenseId, teamId: selectedTeam },
      });

      if (!licenseExists) {
        return NextResponse.json(
          { message: t('validation.license_not_found') },
          { status: HttpStatus.NOT_FOUND },
        );
      }

      whereConditions.push(Prisma.sql`"licenseId" = ${licenseId}`);
    }

    if (type) {
      // Type is already validated above
      whereConditions.push(Prisma.sql`"type" = ${type}::"RequestType"`);
    }

    // Combine WHERE conditions
    const whereClause = Prisma.join(whereConditions, ' AND ');

    const [currentResults, comparisonResults] = await Promise.all([
      // Current period aggregated data
      prisma.$queryRaw<
        Array<{
          time_bucket: Date;
          total: bigint;
          success: bigint;
          failed: bigint;
        }>
      >(
        Prisma.sql`
          SELECT 
            ${Prisma.raw(dateTruncExpression)} as time_bucket,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'VALID') as success,
            COUNT(*) FILTER (WHERE status != 'VALID') as failed
          FROM "RequestLog"
          WHERE ${whereClause}
            AND "createdAt" >= ${startDate}
            AND "createdAt" < NOW()
          GROUP BY time_bucket
          ORDER BY time_bucket ASC
        `,
      ),

      // Comparison with previous period totals
      prisma.$queryRaw<
        Array<{
          current_total: bigint;
          previous_total: bigint;
        }>
      >(
        Prisma.sql`
          SELECT 
            COUNT(*) FILTER (WHERE "createdAt" >= ${startDate} AND "createdAt" < NOW()) as current_total,
            COUNT(*) FILTER (WHERE "createdAt" >= ${previousStartDate} AND "createdAt" < ${startDate}) as previous_total
          FROM "RequestLog"
          WHERE ${whereClause}
            AND "createdAt" >= ${previousStartDate}
        `,
      ),
    ]);

    // Convert BigInt results to numbers and create lookup map
    const aggregatedData: Record<
      string,
      { total: number; success: number; failed: number }
    > = {};
    for (const row of currentResults) {
      const key = row.time_bucket.toISOString();
      aggregatedData[key] = {
        total: Number(row.total),
        success: Number(row.success),
        failed: Number(row.failed),
      };
    }

    // Calculate comparison percentage
    const currentTotal = Number(comparisonResults[0]?.current_total || 0);
    const previousTotal = Number(comparisonResults[0]?.previous_total || 0);
    const comparedToPrevious =
      previousTotal === 0
        ? '0%'
        : `${Math.round(((currentTotal - previousTotal) / previousTotal) * 100)}%`;

    // Generate time series data with proper intervals
    const data = generateTimeSeriesData(timeRange, aggregatedData);

    const response = NextResponse.json({
      data,
      comparedToPrevious,
    });

    // Add caching headers for analytics data
    const cacheMaxAge =
      timeRange === '1h' ? 60 : timeRange === '24h' ? 300 : 1800; // 1min, 5min, 30min
    response.headers.set(
      'Cache-Control',
      `private, max-age=${cacheMaxAge}, stale-while-revalidate=${cacheMaxAge * 2}`,
    );
    response.headers.set('Vary', 'Cookie');

    return response;
  } catch (error) {
    logger.error("Error occurred in 'dashboard/requests' route", error);
    return NextResponse.json(
      { message: t('general.server_error') },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
