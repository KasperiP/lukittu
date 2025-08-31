import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setTeamCleanupSettingsSchema,
  SetTeamCleanupSettingsSchema,
} from '@/lib/validation/team/set-team-cleanup-settings-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  logger,
  prisma,
  Settings,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type ITeamsSettingsCleanupEditSuccessResponse = {
  settings: Settings;
};

export type ITeamsSettingsCleanupEditResponse =
  | ErrorResponse
  | ITeamsSettingsCleanupEditSuccessResponse;

export async function PUT(
  request: NextRequest,
): Promise<NextResponse<ITeamsSettingsCleanupEditResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetTeamCleanupSettingsSchema;
    const validated =
      await setTeamCleanupSettingsSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
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
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (!session.user.teams.length) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
          field: 'id',
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const { expiredLicenseCleanupDays, danglingCustomerCleanupDays } =
      validated.data;

    const response = await prisma.$transaction(async (prisma) => {
      const updatedSettings = await prisma.settings.update({
        where: {
          teamId: selectedTeam,
        },
        data: {
          expiredLicenseCleanupDays,
          danglingCustomerCleanupDays,
        },
      });

      const response = {
        settings: updatedSettings,
      };

      await createAuditLog({
        userId: session.user.id,
        teamId: selectedTeam,
        action: AuditLogAction.UPDATE_TEAM_SETTINGS,
        targetId: selectedTeam,
        targetType: AuditLogTargetType.TEAM,
        requestBody: body,
        responseBody: response,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      return response;
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'teams/settings/cleanup' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
