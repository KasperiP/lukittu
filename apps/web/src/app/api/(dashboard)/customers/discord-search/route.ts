import { getDiscordUser } from '@/lib/providers/discord';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, regex } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

interface ICustomerDiscordSearchGetSuccess {
  user: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    global_name: string | null;
  };
}

type ICustomerDiscordSearchGetResponse =
  | ICustomerDiscordSearchGetSuccess
  | ErrorResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ICustomerDiscordSearchGetResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const searchParams = request.nextUrl.searchParams;
    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const discordId = searchParams.get('discordId');

    if (!discordId || !regex.discordId.test(discordId)) {
      return NextResponse.json(
        {
          message: t('validation.invalid_discord_id'),
        },
        { status: HttpStatus.BAD_REQUEST },
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
        { status: HttpStatus.NOT_FOUND },
      );
    }

    // Fetch Discord user information
    try {
      const user = await getDiscordUser(discordId);

      if (!user) {
        return NextResponse.json(
          {
            message: t('validation.discord_user_not_found'),
          },
          { status: HttpStatus.NOT_FOUND },
        );
      }

      return NextResponse.json(
        {
          user,
        },
        { status: HttpStatus.OK },
      );
    } catch (error) {
      logger.warn('Failed to fetch Discord user data for user', {
        discordId,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        {
          message: t('validation.discord_api_error'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }
  } catch (error) {
    logger.error("Error occurred in 'customers/discord-search' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
