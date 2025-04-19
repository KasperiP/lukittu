import { getSession } from '@/lib/security/session';
import { iso3ToName } from '@/lib/utils/country-helpers';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, regex } from '@lukittu/shared';
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
      return new Date(now.setHours(now.getHours() - 1));
    case '24h':
      return new Date(now.setHours(now.getHours() - 24));
    case '7d':
      return new Date(now.setDate(now.getDate() - 7));
    case '30d':
      return new Date(now.setDate(now.getDate() - 30));
    default:
      return new Date(now.setHours(now.getHours() - 24));
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
            include: {
              requestLogs: {
                where: {
                  licenseId: licenseId ? licenseId : undefined,
                  createdAt: {
                    gte: getStartDate(timeRange),
                  },
                  country: {
                    not: null,
                  },
                },
                select: {
                  country: true,
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

    const mapData = requestLogs.reduce<MapData[]>((acc, { country }) => {
      const existingCountry = acc.find((c) => c.alpha_3 === country);
      if (existingCountry) {
        existingCountry.requests += 1;
      } else {
        acc.push({
          alpha_3: country!,
          name: iso3ToName(country) ?? t('general.unknown'),
          requests: 1,
        });
      }
      return acc;
    }, []);

    return NextResponse.json({ data: mapData });
  } catch (error) {
    logger.error("Error occurred in 'dashboard/map-data' route", error);
    return NextResponse.json(
      { message: t('general.server_error') },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
