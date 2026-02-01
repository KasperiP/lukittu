import { isRateLimited } from '@/lib/security/rate-limiter';
import { getSession } from '@/lib/security/session';
import { getIp, getLanguage } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, Provider } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';

export interface ITwoFactorStatusSuccessResponse {
  enabled: boolean;
  enabledAt: string | null;
  backupCodesRemaining: number;
}

export type ITwoFactorStatusResponse =
  | ErrorResponse
  | ITwoFactorStatusSuccessResponse;

export async function GET(): Promise<NextResponse<ITwoFactorStatusResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    // Rate limiting for status check
    const ip = await getIp();
    if (ip) {
      const key = `two-factor-status:${ip}`;
      const isLimited = await isRateLimited(key, 20, 60); // 20 requests per minute

      if (isLimited) {
        return NextResponse.json(
          {
            message: t('validation.too_many_requests'),
          },
          { status: HttpStatus.TOO_MANY_REQUESTS },
        );
      }
    }

    const session = await getSession({
      user: {
        include: {
          recoveryCodes: {
            where: {
              used: false,
            },
            select: {
              id: true,
            },
          },
          totp: {
            select: {
              createdAt: true,
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

    if (session.user.provider !== Provider.CREDENTIALS) {
      return NextResponse.json(
        {
          message: t('validation.invalid_provider'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Additional rate limiting per user
    const userKey = `two-factor-status:user:${session.user.id}`;
    const isUserLimited = await isRateLimited(userKey, 30, 60); // 30 requests per minute per user

    if (isUserLimited) {
      logger.warn('User-based rate limit exceeded for 2FA status', {
        userId: session.user.id,
      });
      return NextResponse.json(
        {
          message: t('validation.too_many_requests'),
        },
        { status: HttpStatus.TOO_MANY_REQUESTS },
      );
    }

    const backupCodesRemaining = session.user.totp
      ? session.user.recoveryCodes.length
      : 0;

    const response = NextResponse.json({
      enabled: Boolean(session.user.totp),
      enabledAt: session.user.totp
        ? session.user.totp.createdAt.toISOString()
        : null,
      backupCodesRemaining,
    });

    // Add cache control headers for security
    response.headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, private',
    );
    response.headers.set('Pragma', 'no-cache');

    return response;
  } catch (error) {
    logger.error("Error occurred in 'two-factor/status' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
