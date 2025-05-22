import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setReturnedFieldsSchema,
  SetReturnedFieldsSchema,
} from '@/lib/validation/team/set-returned-fields-schema';
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

export type ITeamsSettingsReturnedFieldsEditSuccessResponse = {
  settings: Settings;
};

export type ITeamsSettingsReturnedFieldsEditResponse =
  | ErrorResponse
  | ITeamsSettingsReturnedFieldsEditSuccessResponse;

export async function PUT(
  request: NextRequest,
): Promise<NextResponse<ITeamsSettingsReturnedFieldsEditResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetReturnedFieldsSchema;
    const validated = await setReturnedFieldsSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
          error: true,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
          error: true,
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
          error: true,
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (!session.user.teams.length) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
          field: 'id',
          error: true,
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const data = {
      customerEmail: validated.data.customerEmail,
      customerFullName: validated.data.customerFullName,
      customerUsername: validated.data.customerUsername,
      customerMetadataKeys: validated.data.customerMetadataKeys,
      licenseExpirationDate: validated.data.licenseExpirationDate,
      licenseExpirationDays: validated.data.licenseExpirationDays,
      licenseExpirationStart: validated.data.licenseExpirationStart,
      licenseExpirationType: validated.data.licenseExpirationType,
      licenseIpLimit: validated.data.licenseIpLimit,
      licenseMetadataKeys: validated.data.licenseMetadataKeys,
      licenseSeats: validated.data.licenseSeats,
      productMetadataKeys: validated.data.productMetadataKeys,
      productName: validated.data.productName,
      productUrl: validated.data.productUrl,
      productLatestRelease: validated.data.productLatestRelease,
    };

    const response = await prisma.$transaction(async (prisma) => {
      const updatedSettings = await prisma.settings.update({
        where: {
          teamId: selectedTeam,
        },
        data: {
          returnedFields: {
            upsert: {
              create: data,
              update: data,
            },
          },
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
    logger.error(
      "Error occurred in 'teams/settings/returned-fields' route",
      error,
    );
    return NextResponse.json(
      {
        message: t('general.server_error'),
        error: true,
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
