import { getSession } from '@/lib/security/session';
import { iso3ToName } from '@/lib/utils/country-helpers';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma, Prisma, regex } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type MapData = {
  alpha_3: string;
  name: string;
  requests: number;
};

export type IStatisticsMapDataGetSuccessResponse = {
  data: MapData[];
};

export type IStatisticsMapDataGetResponse =
  | ErrorResponse
  | IStatisticsMapDataGetSuccessResponse;

const allowedTimeRanges = ['1h', '24h', '7d', '30d'] as const;

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

export async function GET(request: NextRequest) {
  const t = await getTranslations({ locale: await getLanguage() });
  const searchParams = request.nextUrl.searchParams;

  const licenseId = searchParams.get('licenseId');

  let timeRange = searchParams.get('timeRange') as '1h' | '24h' | '7d' | '30d';
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

    const whereConditions: Prisma.Sql[] = [
      Prisma.sql`"teamId" = ${selectedTeam}`,
      Prisma.sql`"createdAt" >= ${startDate}`,
      Prisma.sql`"country" IS NOT NULL`,
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

    const whereClause = Prisma.join(whereConditions, ' AND ');

    const countryData = await prisma.$queryRaw<
      Array<{
        country: string;
        requests: bigint;
      }>
    >(
      Prisma.sql`
        SELECT 
          "country",
          COUNT(*) as requests
        FROM "RequestLog"
        WHERE ${whereClause}
        GROUP BY "country"
        ORDER BY requests DESC
      `,
    );

    // Convert to MapData format with country names
    const mapData: MapData[] = countryData.map(({ country, requests }) => ({
      alpha_3: country,
      name: iso3ToName(country) ?? t('general.unknown'),
      requests: Number(requests),
    }));

    const response = NextResponse.json({ data: mapData });

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
    logger.error("Error occurred in 'dashboard/map-data' route", error);
    return NextResponse.json(
      { message: t('general.server_error') },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
