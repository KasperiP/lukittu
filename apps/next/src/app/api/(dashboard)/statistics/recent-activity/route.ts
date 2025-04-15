import { logger } from '@/lib/logging/logger';
import { decryptLicenseKey } from '@/lib/security/crypto';
import { getSession } from '@/lib/security/session';
import { iso3toIso2, iso3ToName } from '@/lib/utils/country-helpers';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { RequestStatus } from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type RecentActivityData = {
  id: string;
  license: string;
  ipAddress: string;
  status: RequestStatus;
  statusCode: number;
  path: string;
  alpha2: string | null;
  country: string | null;
  createdAt: Date;
};

export type IStatisticsRecentActivityGetSuccessResponse = {
  data: RecentActivityData[];
  hasNextPage: boolean;
};

export type IStatisticsRecentActivityGetResponse =
  | ErrorResponse
  | IStatisticsRecentActivityGetSuccessResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<IStatisticsRecentActivityGetResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });
  const searchParams = request.nextUrl.searchParams;

  try {
    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        { message: t('validation.team_not_found') },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const pageSize = 5;
    let page = parseInt(searchParams.get('page') as string) || 1;
    if (page < 1) {
      page = 1;
    }

    const skip = (page - 1) * pageSize;

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
                  licenseId: {
                    not: null,
                  },
                },
                include: {
                  license: true,
                },
                orderBy: {
                  createdAt: 'desc',
                },
                skip,
                take: 6,
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

    const team = session.user.teams[0];

    const data: RecentActivityData[] = team.requestLogs
      .slice(0, 5)
      .map((log) => ({
        id: log.id,
        license: decryptLicenseKey(log.license!.licenseKey),
        ipAddress: log.ipAddress || '',
        path: log.path,
        statusCode: log.statusCode,
        status: log.status,
        createdAt: log.createdAt,
        alpha2: iso3toIso2(log.country),
        country: iso3ToName(log.country),
      }));

    return NextResponse.json({
      data,
      hasNextPage: team.requestLogs.length > pageSize,
    });
  } catch (error) {
    logger.error("Error occurred in 'dashboard/recent-activity' route", error);
    return NextResponse.json(
      { message: t('general.server_error') },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
