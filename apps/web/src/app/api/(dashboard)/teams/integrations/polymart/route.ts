import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setPolymartIntegrationSchema,
  SetPolymartIntegrationSchema,
} from '@/lib/validation/integrations/set-polymart-integration-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogTargetType,
  logger,
  prisma,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export interface ITeamsIntegrationsPolymartSetSuccessResponse {
  success: boolean;
}

export type ITeamsIntegrationsPolymartSetResponse =
  | ErrorResponse
  | ITeamsIntegrationsPolymartSetSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ITeamsIntegrationsPolymartSetResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetPolymartIntegrationSchema;
    const validated =
      await setPolymartIntegrationSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { active, apiSecret } = validated.data;

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

    const team = session.user.teams[0];

    await prisma.polymartIntegration.upsert({
      where: {
        teamId: team.id,
      },
      create: {
        team: {
          connect: {
            id: team.id,
          },
        },
        active,
        apiSecret,
        createdBy: {
          connect: {
            id: session.user.id,
          },
        },
      },
      update: {
        active,
        apiSecret,
      },
    });

    const response = {
      success: true,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.SET_POLYMART_INTEGRATION,
      targetId: selectedTeam,
      targetType: AuditLogTargetType.TEAM,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      "Error occurred in 'teams/integrations/polymart' route",
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

export interface ITeamsIntegrationsPolymartDeleteSuccessResponse {
  success: boolean;
}

export type ITeamsIntegrationsPolymartDeleteResponse =
  | ErrorResponse
  | ITeamsIntegrationsPolymartDeleteSuccessResponse;

export async function DELETE(): Promise<
  NextResponse<ITeamsIntegrationsPolymartDeleteResponse>
> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
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
              polymartIntegration: true,
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

    if (!team.polymartIntegration) {
      return NextResponse.json(
        {
          message: t('validation.polymart_integration_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    await prisma.polymartIntegration.delete({
      where: {
        teamId: team.id,
      },
    });

    const response = {
      success: true,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.DELETE_POLYMART_INTEGRATION,
      targetId: selectedTeam,
      targetType: AuditLogTargetType.TEAM,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      "Error occurred in 'teams/integrations/polymart' DELETE route",
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
