import { logger } from '@/lib/logging/logger';
import { getSession } from '@/lib/security/session';
import { iso3toIso2, iso3ToName } from '@/lib/utils/country-helpers';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { AuditLogAction, AuditLogTargetType } from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type RecentAuditLogs = {
  id: string;
  ipAddress: string | null;
  targetType: AuditLogTargetType;
  action: AuditLogAction;
  country: string | null;
  system: boolean;
  alpha2: string | null;
  imageUrl: string | null;
  fullName: string | null;
  email: string | null;
  createdAt: Date;
};

export type IStatisticsRecentAuditLogsSuccessResponse = {
  data: RecentAuditLogs[];
  hasNextPage: boolean;
};

export type IStatisticsRecentAuditLogsResponse =
  | ErrorResponse
  | IStatisticsRecentAuditLogsSuccessResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<IStatisticsRecentAuditLogsResponse>> {
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

    const pageSize = 4;
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
              auditLogs: {
                orderBy: {
                  createdAt: 'desc',
                },
                include: {
                  user: true,
                },
                skip,
                take: 5,
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

    const data: RecentAuditLogs[] = team.auditLogs
      .slice(0, pageSize)
      .map((log) => ({
        id: log.id,
        ipAddress: log.ipAddress,
        targetType: log.targetType,
        action: log.action,
        country: iso3ToName(log.country),
        alpha2: iso3toIso2(log.country),
        system: log.system,
        imageUrl: log.user?.imageUrl ?? null,
        fullName: log.user?.fullName ?? null,
        email: log.user?.email ?? null,
        createdAt: log.createdAt,
      }));

    return NextResponse.json({
      data,
      hasNextPage: team.auditLogs.length > pageSize,
    });
  } catch (error) {
    logger.error("Error occurred in 'dashboard/recent-activity' route", error);
    return NextResponse.json(
      { message: t('general.server_error') },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
