import {
  DiscordOAuthTokenResponse,
  DiscordUser,
  exchangeDiscordAuthCode,
  fetchDiscordUserProfile,
  revokeDiscordToken,
} from '@/lib/providers/discord';
import { getSession } from '@/lib/security/session';
import { getLanguage } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { decryptString, encryptString, logger, prisma } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  const cookiesStore = await cookies();
  const expectedState = cookiesStore.get('discord_oauth_state')?.value;

  if (error || !code) {
    logger.error('Discord OAuth error:', error);
    return NextResponse.redirect(
      new URL('/dashboard/profile?error=server_error', baseUrl),
    );
  }

  if (!state || !expectedState || state !== expectedState) {
    logger.error('Discord OAuth state mismatch or missing');
    return NextResponse.redirect(
      new URL('/dashboard/profile?error=invalid_state', baseUrl),
    );
  }

  try {
    const session = await getSession({
      user: true,
    });

    if (!session?.user) {
      return NextResponse.redirect(new URL('/auth/login', baseUrl));
    }

    const response = NextResponse.next();
    response.cookies.delete('discord_oauth_state');

    let tokenData: DiscordOAuthTokenResponse;
    try {
      tokenData = await exchangeDiscordAuthCode(code, session.user.id);
    } catch (error) {
      logger.error('Failed to exchange Discord code for token:', error);
      return NextResponse.redirect(
        new URL('/dashboard/profile?error=server_error', baseUrl),
      );
    }

    const accessToken = tokenData.access_token;

    let userData: DiscordUser;
    try {
      userData = await fetchDiscordUserProfile(accessToken);
    } catch (error) {
      logger.error('Failed to get Discord user data:', error);
      return NextResponse.redirect(
        new URL('/dashboard/profile?error=server_error', baseUrl),
      );
    }

    const encryptedRefreshToken = encryptString(tokenData.refresh_token);

    // Check if this Discord account is already linked to another user
    const existingDiscordAccount = await prisma.userDiscordAccount.findUnique({
      where: { discordId: userData.id },
      select: { userId: true },
    });

    if (
      existingDiscordAccount &&
      existingDiscordAccount.userId !== session.user.id
    ) {
      logger.warn('Discord account already linked to another user', {
        discordId: userData.id,
        currentUserId: session.user.id,
        linkedUserId: existingDiscordAccount.userId,
      });
      return NextResponse.redirect(
        new URL('/dashboard/profile?error=discord_already_linked', baseUrl),
      );
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        discordAccount: {
          upsert: {
            create: {
              username: userData.username,
              avatar: userData.avatar,
              discordId: userData.id,
              refreshToken: encryptedRefreshToken,
              globalName: userData.global_name,
            },
            update: {
              username: userData.username,
              avatar: userData.avatar,
              discordId: userData.id,
              refreshToken: encryptedRefreshToken,
              globalName: userData.global_name,
            },
          },
        },
      },
    });

    return NextResponse.redirect(new URL('/dashboard/profile', baseUrl));
  } catch (error) {
    logger.error("Error occurred in 'auth/oauth/discord' route", error);
    return NextResponse.redirect(
      new URL('/dashboard/profile?error=server_error', baseUrl),
    );
  }
}

interface IDiscordDisconnectSuccessResponse {
  success: boolean;
}

export type IDiscordConnectionResponse =
  | IDiscordDisconnectSuccessResponse
  | ErrorResponse;

export async function DELETE(): Promise<NextResponse> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const session = await getSession({
      user: {
        include: {
          discordAccount: {
            omit: {
              refreshToken: false,
            },
          },
        },
      },
    });

    if (!session?.user) {
      return NextResponse.json(
        { message: t('validation.unauthorized') },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    const { discordAccount } = session.user;

    if (!discordAccount) {
      return NextResponse.json(
        { message: t('validation.no_discord_account') },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Try revoking the refresh token if it exists
    if (discordAccount.refreshToken) {
      try {
        const decryptedRefreshToken = decryptString(
          discordAccount.refreshToken,
        );
        await revokeDiscordToken(decryptedRefreshToken, session.user.id);
        logger.info('Discord refresh token revoked successfully', {
          userId: session.user.id,
        });
      } catch (error) {
        logger.warn('Failed to revoke Discord refresh token', {
          userId: session.user.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Remove the Discord account from database
    await prisma.userDiscordAccount.delete({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error occurred in 'auth/oauth/discord' route", error);
    return NextResponse.json(
      { message: t('general.server_error') },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
