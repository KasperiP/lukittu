import { logger } from '@/lib/logging/logger';
import { getSession } from '@/lib/security/session';
import { getLanguage } from '@/lib/utils/header-helpers';
import { HttpStatus } from '@/types/http-status';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/database/prisma';
import { ErrorResponse } from '@/types/common-api-types';
import { cookies } from 'next/headers';

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

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '',
        client_secret: process.env.DISCORD_CLIENT_SECRET || '',
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || '',
      }),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      logger.error('Failed to exchange Discord code for token:', text);
      return NextResponse.redirect(
        new URL('/dashboard/profile?error=server_error', baseUrl),
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      logger.error(
        'Failed to get Discord user data:',
        await userResponse.text(),
      );
      return NextResponse.redirect(
        new URL('/dashboard/profile?error=server_error', baseUrl),
      );
    }

    const userData = await userResponse.json();

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        discordAccount: {
          upsert: {
            create: {
              username: userData.username,
              avatarUrl: userData.avatar
                ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
                : null,
              discordId: userData.id,
            },
            update: {
              username: userData.username,
              avatarUrl: userData.avatar
                ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
                : null,
              discordId: userData.id,
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
          discordAccount: true,
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

    await prisma.discordAccount.delete({
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
