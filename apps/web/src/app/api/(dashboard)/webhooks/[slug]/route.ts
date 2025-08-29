import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setWebhookSchema,
  SetWebhookSchema,
} from '@/lib/validation/webhooks/set-webhook-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  logger,
  prisma,
  regex,
  Webhook,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type IWebhookDeleteSuccessResponse = {
  success: boolean;
};

export type IWebhookDeleteResponse =
  | ErrorResponse
  | IWebhookDeleteSuccessResponse;

export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<IWebhookDeleteResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const webhookId = params.slug;

    if (!webhookId || !regex.uuidV4.test(webhookId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
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
              deletedAt: null,
              id: selectedTeam,
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
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const webhook = await prisma.webhook.findUnique({
      where: {
        id: webhookId,
        teamId: selectedTeam,
      },
    });

    if (!webhook) {
      return NextResponse.json(
        {
          message: t('validation.webhook_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const response = await prisma.$transaction(async (prisma) => {
      await prisma.webhook.delete({
        where: {
          id: webhookId,
          teamId: selectedTeam,
        },
      });

      const response = {
        success: true,
      };

      await createAuditLog({
        userId: session.user.id,
        teamId: selectedTeam,
        action: AuditLogAction.DELETE_WEBHOOK,
        targetId: webhook.id,
        targetType: AuditLogTargetType.WEBHOOK,
        responseBody: response,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      return response;
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'webhooks/[slug]' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

export type IWebhookUpdateSuccessResponse = {
  webhook: Webhook;
};

export type IWebhookUpdateResponse =
  | ErrorResponse
  | IWebhookUpdateSuccessResponse;

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<IWebhookUpdateResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const webhookId = params.slug;

    if (!webhookId || !regex.uuidV4.test(webhookId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const body = (await request.json()) as SetWebhookSchema;
    const validated = await setWebhookSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          field: validated.error.errors[0].path[0],
          message: validated.error.errors[0].message,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { name, url, active, enabledEvents } = validated.data;

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
              deletedAt: null,
              id: selectedTeam,
            },
            include: {
              webhooks: true,
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

    if (!team.webhooks.find((webhook) => webhook.id === webhookId)) {
      return NextResponse.json(
        {
          message: t('validation.webhook_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    // Check if webhook with same name already exists (excluding current webhook)
    if (
      team.webhooks.find(
        (webhook) => webhook.name === name && webhook.id !== webhookId,
      )
    ) {
      return NextResponse.json(
        {
          message: t('validation.webhook_name_already_exists'),
          field: 'name',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Check if webhook with same URL already exists (excluding current webhook)
    if (
      team.webhooks.find(
        (webhook) => webhook.url === url && webhook.id !== webhookId,
      )
    ) {
      return NextResponse.json(
        {
          message: t('validation.webhook_url_already_exists'),
          field: 'url',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const response = await prisma.$transaction(async (prisma) => {
      const webhook = await prisma.webhook.update({
        where: {
          id: webhookId,
        },
        data: {
          name,
          url,
          active,
          enabledEvents,
        },
      });

      const response = {
        webhook,
      };

      await createAuditLog({
        userId: session.user.id,
        teamId: selectedTeam,
        action: AuditLogAction.UPDATE_WEBHOOK,
        targetId: webhook.id,
        targetType: AuditLogTargetType.WEBHOOK,
        requestBody: body,
        responseBody: response,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      return response;
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'webhooks/[slug]' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
