import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, StripeIntegration } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type ITeamsIntegrationsGetSuccessResponse = {
  integrations: {
    stripeIntegration: StripeIntegration | null;
  };
};

export type ITeamsIntegrationsGetResponse =
  | ErrorResponse
  | ITeamsIntegrationsGetSuccessResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ITeamsIntegrationsGetResponse>> {
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
        { message: t('validation.unauthorized') },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (!session.user.teams.length) {
      return NextResponse.json(
        { message: t('validation.team_not_found') },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const team = session.user.teams[0];
    const stripeIntegration = team.stripeIntegration;

    return NextResponse.json(
      {
        integrations: {
          stripeIntegration: stripeIntegration ? stripeIntegration : null,
        },
      },
      { status: HttpStatus.OK },
    );
  } catch (error) {
    logger.error("Error occurred in 'teams/integrations' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
