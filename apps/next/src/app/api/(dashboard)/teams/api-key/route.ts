import prisma from '@/lib/database/prisma';
import { createAuditLog } from '@/lib/logging/audit-log';
import { logger } from '@/lib/logging/logger';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  createApiKeySchema,
  CreateApiKeySchema,
} from '@/lib/validation/team/create-api-key-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { AuditLogAction, AuditLogTargetType } from '@lukittu/prisma';
import crypto from 'crypto';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type ITeamsCreateApiKeySuccessResponse = {
  apiKey: string;
};

export type ITeamsCreateApiKeyResponse =
  | ErrorResponse
  | ITeamsCreateApiKeySuccessResponse;

export async function POST(request: NextRequest) {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as CreateApiKeySchema;
    const validated = await createApiKeySchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          field: validated.error.errors[0].path[0],
          message: validated.error.errors[0].message,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { expiresAt } = validated.data;

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
              apiKeys: true,
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
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const team = session.user.teams[0];

    if (!team.limits) {
      // Should never happen
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (team.apiKeys.length >= team.limits.maxApiKeys) {
      return NextResponse.json(
        {
          message: t('validation.api_key_limit_reached'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const apiKey = crypto.randomBytes(32).toString('hex');
    const hashedApiKey = crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');

    await prisma.apiKey.create({
      data: {
        teamId: team.id,
        key: hashedApiKey,
        createdByUserId: session.user.id,
        expiresAt,
      },
    });

    const response = {
      apiKey: `${apiKey.substring(0, 6)}${'*'.repeat(26)}`,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.CREATE_API_KEY,
      targetId: team.id,
      targetType: AuditLogTargetType.TEAM,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(
      {
        apiKey,
      },
      { status: HttpStatus.CREATED },
    );
  } catch (error) {
    logger.error("Error occurred in 'teams/api-key' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
