import prisma from '@/lib/database/prisma';
import { createAuditLog } from '@/lib/logging/audit-log';
import { logger } from '@/lib/logging/logger';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setStripeIntegrationSchema,
  SetStripeIntegrationSchema,
} from '@/lib/validation/integrations/set-stripe-integration-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { AuditLogAction, AuditLogTargetType } from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export interface ITeamsIntegrationsStripeSetSuccessResponse {
  success: boolean;
}

export type ITeamsIntegrationsStripeSetResponse =
  | ErrorResponse
  | ITeamsIntegrationsStripeSetSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ITeamsIntegrationsStripeSetResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetStripeIntegrationSchema;
    const validated = await setStripeIntegrationSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { active, apiKey, webhookSecret } = validated.data;

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

    const stripe = new Stripe(apiKey, {
      apiVersion: '2025-02-24.acacia',
    });

    try {
      await stripe.customers.list();
    } catch (error) {
      logger.error('Error occurred while validating Stripe API key', error);
      return NextResponse.json(
        {
          message: t('validation.stripe_api_key_invalid'),
          field: 'apiKey',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const team = session.user.teams[0];

    await prisma.stripeIntegration.upsert({
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
        apiKey,
        webhookSecret,
      },
      update: {
        active,
        apiKey,
        webhookSecret,
      },
    });

    const response = {
      success: true,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.SET_STRIPE_INTEGRATION,
      targetId: selectedTeam,
      targetType: AuditLogTargetType.TEAM,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'teams/integrations/stripe' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

export interface ITeamsIntegrationsStripeDeleteSuccessResponse {
  success: boolean;
}

export type ITeamsIntegrationsStripeDeleteResponse =
  | ErrorResponse
  | ITeamsIntegrationsStripeDeleteSuccessResponse;

export async function DELETE(): Promise<
  NextResponse<ITeamsIntegrationsStripeDeleteResponse>
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
              stripeIntegration: true,
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

    if (!team.stripeIntegration) {
      return NextResponse.json(
        {
          message: t('validation.stripe_integration_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    await prisma.stripeIntegration.delete({
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
      action: AuditLogAction.DELETE_STRIPE_INTEGRATION,
      targetId: selectedTeam,
      targetType: AuditLogTargetType.TEAM,
      requestBody: null,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'teams/integrations/stripe' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
