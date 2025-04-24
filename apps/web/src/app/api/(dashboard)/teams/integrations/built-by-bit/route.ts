import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  SetBuiltByBitIntegrationSchema,
  setBuiltByBitIntegrationSchema,
} from '@/lib/validation/integrations/set-built-by-bit-integration-schema';
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

export interface ITeamsIntegrationsBuiltByBitSetSuccessResponse {
  success: boolean;
}

export type ITeamsIntegrationsBuiltByBitSetResponse =
  | ErrorResponse
  | ITeamsIntegrationsBuiltByBitSetSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ITeamsIntegrationsBuiltByBitSetResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetBuiltByBitIntegrationSchema;
    const validated =
      await setBuiltByBitIntegrationSchema(t).safeParseAsync(body);

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

    await prisma.builtByBitIntegration.upsert({
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
      action: AuditLogAction.SET_BUILD_BY_BIT_INTEGRATION,
      targetId: selectedTeam,
      targetType: AuditLogTargetType.TEAM,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      "Error occurred in 'teams/integrations/built-by-bit' route",
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

export interface ITeamsIntegrationsBuiltByBitDeleteSuccessResponse {
  success: boolean;
}

export type ITeamsIntegrationsBuiltByBitDeleteResponse =
  | ErrorResponse
  | ITeamsIntegrationsBuiltByBitDeleteSuccessResponse;

export async function DELETE(): Promise<
  NextResponse<ITeamsIntegrationsBuiltByBitDeleteResponse>
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
              builtByBitIntegration: true,
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

    if (!team.builtByBitIntegration) {
      return NextResponse.json(
        {
          message: t('validation.built_by_bit_integration_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    await prisma.builtByBitIntegration.delete({
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
      action: AuditLogAction.DELETE_BUILD_BY_BIT_INTEGRATION,
      targetId: selectedTeam,
      targetType: AuditLogTargetType.TEAM,
      requestBody: null,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      "Error occurred in 'teams/integrations/built-by-bit' route",
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
