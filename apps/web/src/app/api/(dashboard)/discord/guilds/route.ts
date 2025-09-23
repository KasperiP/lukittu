import {
  DiscordGuild,
  fetchBotGuilds,
  fetchDiscordUserGuilds,
  findCommonGuildsWithPermissions,
  getDiscordTokens,
} from '@/lib/providers/discord';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export interface IDiscordGuildsGetSuccessResponse {
  guilds: DiscordGuild[];
}

export type IDiscordGuildsGetResponse =
  | IDiscordGuildsGetSuccessResponse
  | ErrorResponse;

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<IDiscordGuildsGetResponse>> {
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
              deletedAt: null,
              id: selectedTeam,
            },
          },
          discordAccount: {
            omit: {
              refreshToken: false,
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

    if (!session.user.discordAccount) {
      return NextResponse.json(
        {
          message: t('validation.no_discord_account'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (!session.user.discordAccount.refreshToken) {
      return NextResponse.json(
        {
          message: t('validation.discord_api_error'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    try {
      const tokenResult = await getDiscordTokens(
        session.user.discordAccount.refreshToken,
        session.user.id,
      );

      if (!tokenResult) {
        return NextResponse.json(
          {
            message: t('validation.discord_api_error'),
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }

      // Fetch user's guilds and bot's guilds concurrently
      const [userGuilds, botGuilds] = await Promise.all([
        fetchDiscordUserGuilds(
          tokenResult.accessToken,
          session.user.discordAccount.discordId,
        ),
        fetchBotGuilds(),
      ]);

      // Find common guilds where both user and bot have manage roles permissions
      const commonGuilds = findCommonGuildsWithPermissions(
        userGuilds,
        botGuilds,
      );

      return NextResponse.json(
        {
          guilds: commonGuilds,
        },
        { status: HttpStatus.OK },
      );
    } catch (error) {
      logger.warn('Failed to fetch Discord guilds data for user', {
        userId: session.user.id,
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
    logger.error("Error occurred in 'discord/guilds' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
