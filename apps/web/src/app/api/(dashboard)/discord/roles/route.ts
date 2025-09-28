import {
  DiscordRole,
  fetchBotGuildMember,
  fetchBotGuilds,
  fetchDiscordUserGuilds,
  fetchGuildRoles,
  fetchUserGuildMember,
  getAssignableRoles,
  getDiscordTokens,
} from '@/lib/providers/discord';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, regex } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export interface IDiscordRolesGetSuccessResponse {
  roles: DiscordRole[];
}

export type IDiscordRolesGetResponse =
  | IDiscordRolesGetSuccessResponse
  | ErrorResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<IDiscordRolesGetResponse>> {
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

    const guildId = searchParams.get('guildId');

    if (!guildId || !regex.discordId.test(guildId)) {
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

    // Check if user has linked Discord account
    if (!session.user.discordAccount) {
      return NextResponse.json(
        {
          message: t('validation.no_discord_account'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Check if user has valid refresh token
    if (!session.user.discordAccount.refreshToken) {
      return NextResponse.json(
        {
          message: t('validation.discord_api_error'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    try {
      // Get Discord tokens (refresh if needed)
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

      // Fetch all required data concurrently
      const [userGuilds, botGuilds, guildRoles, userMember, botMember] =
        await Promise.all([
          fetchDiscordUserGuilds(
            tokenResult.accessToken,
            session.user.discordAccount.discordId,
          ),
          fetchBotGuilds(),
          fetchGuildRoles(guildId),
          fetchUserGuildMember(
            guildId,
            tokenResult.accessToken,
            session.user.discordAccount.discordId,
          ),
          fetchBotGuildMember(guildId),
        ]);

      // Verify user is in the guild
      if (!userMember) {
        return NextResponse.json(
          {
            message: t('validation.discord_user_not_found'),
          },
          { status: HttpStatus.NOT_FOUND },
        );
      }

      // Verify bot is in the guild
      if (!botMember) {
        return NextResponse.json(
          {
            message: t('validation.discord_api_error'),
          },
          { status: HttpStatus.NOT_FOUND },
        );
      }

      // Find user's guild info from their guilds
      const userGuild = userGuilds.find((guild) => guild.id === guildId);
      if (!userGuild) {
        return NextResponse.json(
          {
            message: t('validation.discord_user_not_found'),
          },
          { status: HttpStatus.NOT_FOUND },
        );
      }

      // Find bot's guild info from bot guilds
      const botGuild = botGuilds.find((guild) => guild.id === guildId);
      if (!botGuild) {
        return NextResponse.json(
          {
            message: t('validation.discord_api_error'),
          },
          { status: HttpStatus.NOT_FOUND },
        );
      }

      // Get roles that both user and bot can assign (respecting role hierarchy)
      const assignableRoles = getAssignableRoles(
        guildRoles,
        userMember,
        botMember,
        userGuild,
        botGuild,
      );

      return NextResponse.json(
        {
          roles: assignableRoles,
        },
        { status: HttpStatus.OK },
      );
    } catch (error) {
      logger.warn('Failed to fetch Discord roles data for user', {
        userId: session.user.id,
        guildId,
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
    logger.error("Error occurred in 'discord/roles' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
