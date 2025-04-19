import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setTeamValidationSettingsSchema,
  SetTeamValidationSettingsSchema,
} from '@/lib/validation/team/set-team-validation-settings-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogTargetType,
  logger,
  prisma,
  Settings,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type ITeamsSettingsValidationEditSuccessResponse = {
  settings: Settings;
};

export type ITeamsSettingsValidationEditResponse =
  | ErrorResponse
  | ITeamsSettingsValidationEditSuccessResponse;

export async function PUT(
  request: NextRequest,
): Promise<NextResponse<ITeamsSettingsValidationEditResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetTeamValidationSettingsSchema;
    const validated =
      await setTeamValidationSettingsSchema(t).safeParseAsync(body);

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

    const {
      strictCustomers,
      strictProducts,
      deviceTimeout,
      ipLimitPeriod,
      strictReleases,
    } = validated.data;

    const updatedSettings = await prisma.settings.update({
      where: {
        teamId: selectedTeam,
      },
      data: {
        strictCustomers,
        strictProducts,
        strictReleases,
        deviceTimeout,
        ipLimitPeriod,
      },
    });
    const response = {
      settings: updatedSettings,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.UPDATE_TEAM_SETTINGS,
      targetId: selectedTeam,
      targetType: AuditLogTargetType.TEAM,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'teams/settings/validation' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
