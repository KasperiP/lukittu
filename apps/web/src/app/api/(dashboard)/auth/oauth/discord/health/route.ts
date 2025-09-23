import { getDiscordTokens } from '@/lib/providers/discord';
import { getSession } from '@/lib/security/session';
import { getLanguage } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { encryptString, logger, prisma } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';

export interface IDiscordHealthSuccessResponse {
  connected: boolean;
  tokenValid: boolean;
}

export type IDiscordHealthResponse =
  | ErrorResponse
  | IDiscordHealthSuccessResponse;

export async function GET(): Promise<NextResponse<IDiscordHealthResponse>> {
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
      return NextResponse.json({
        connected: false,
        tokenValid: false,
      });
    }

    const refreshTokenExists = Boolean(discordAccount.refreshToken);
    let tokenValid = false;

    if (refreshTokenExists) {
      try {
        const tokens = await getDiscordTokens(
          discordAccount.refreshToken!,
          session.user.id,
        );

        if (tokens) {
          tokenValid = true;

          // Handle token rotation
          if (tokens.tokenRotated) {
            const encryptedRefreshToken = encryptString(tokens.refreshToken);

            await prisma.userDiscordAccount.update({
              where: { userId: session.user.id },
              data: {
                refreshToken: encryptedRefreshToken,
              },
            });

            logger.info('Discord refresh token rotated and updated', {
              userId: session.user.id,
            });
          }
        } else {
          // Invalid refresh token - remove it from database
          await prisma.userDiscordAccount.update({
            where: { userId: session.user.id },
            data: {
              refreshToken: null,
            },
          });
          logger.warn('Invalid Discord refresh token removed from database', {
            userId: session.user.id,
          });
        }
      } catch (error) {
        logger.error('Failed to get Discord access token', {
          userId: session.user.id,
          error: error instanceof Error ? error.message : String(error),
        });
        tokenValid = false;
      }
    }

    return NextResponse.json({
      connected: true,
      tokenValid,
    });
  } catch (error) {
    logger.error("Error occurred in 'auth/oauth/discord/health' route", error);
    return NextResponse.json(
      { message: t('general.server_error') },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
