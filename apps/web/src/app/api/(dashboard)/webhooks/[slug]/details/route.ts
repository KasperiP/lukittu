import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, regex, User, Webhook } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type IWebhookGetSuccessResponse = {
  webhook: Webhook & {
    createdBy: Omit<User, 'passwordHash'> | null;
  };
};

export type IWebhookGetResponse = IWebhookGetSuccessResponse | ErrorResponse;

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<IWebhookGetResponse>> {
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
              id: selectedTeam,
              deletedAt: null,
            },
            include: {
              webhooks: {
                where: {
                  id: webhookId,
                },
                include: {
                  createdBy: true,
                },
              },
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

    if (!team.webhooks.length) {
      return NextResponse.json(
        {
          message: t('validation.webhook_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const webhook = team.webhooks[0];

    return NextResponse.json({
      webhook,
    });
  } catch (error) {
    logger.error("Error occurred in 'webhooks/[slug]' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
