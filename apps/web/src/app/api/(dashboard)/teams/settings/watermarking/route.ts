import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setTeamWatermarkingSettingsSchema,
  SetTeamWatermarkingSettingsSchema,
} from '@/lib/validation/team/set-team-watermarking-settings-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogTargetType,
  logger,
  prisma,
  WatermarkingSettings,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type ITeamsSettingsWatermarkingEditSuccessResponse = {
  settings: WatermarkingSettings;
};

export type ITeamsSettingsWatermarkingEditResponse =
  | ErrorResponse
  | ITeamsSettingsWatermarkingEditSuccessResponse;

export async function PUT(
  request: NextRequest,
): Promise<NextResponse<ITeamsSettingsWatermarkingEditResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetTeamWatermarkingSettingsSchema;
    const validated = setTeamWatermarkingSettingsSchema().safeParse(body);

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
            include: {
              limits: true,
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

    const team = session.user.teams[0];

    if (!team.limits?.allowWatermarking) {
      return NextResponse.json(
        {
          message: t('validation.paid_subsciption_required'),
        },
        { status: HttpStatus.FORBIDDEN },
      );
    }

    const updatedSettings = await prisma.watermarkingSettings.upsert({
      where: {
        teamId: selectedTeam,
      },
      create: {
        ...validated.data,
        team: {
          connect: {
            id: selectedTeam,
          },
        },
      },
      update: validated.data,
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
    logger.error(
      "Error occurred in 'teams/settings/watermarking' route",
      error,
    );
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
