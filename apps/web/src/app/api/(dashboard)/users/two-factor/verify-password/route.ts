import { isRateLimited } from '@/lib/security/rate-limiter';
import { getSession } from '@/lib/security/session';
import { getIp, getLanguage } from '@/lib/utils/header-helpers';
import {
  VerifyPasswordSchema,
  verifyPasswordSchema,
} from '@/lib/validation/two-factor/verify-password-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, Provider, verifyPassword } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export interface IVerifyPasswordSuccessResponse {
  success: boolean;
}

export type IVerifyPasswordResponse =
  | ErrorResponse
  | IVerifyPasswordSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IVerifyPasswordResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as VerifyPasswordSchema;
    const validated = await verifyPasswordSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Rate limiting by IP
    const ip = await getIp();
    if (ip) {
      const key = `two-factor-verify-password:${ip}`;
      const isLimited = await isRateLimited(key, 5, 300); // 5 requests per 5 minutes

      if (isLimited) {
        return NextResponse.json(
          {
            message: t('validation.too_many_requests'),
          },
          { status: HttpStatus.TOO_MANY_REQUESTS },
        );
      }
    }

    const { password } = validated.data;

    const session = await getSession({
      user: {
        omit: {
          passwordHash: false,
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
    const userKey = `two-factor-verify-password:user:${session.user.id}`;
    const isUserLimited = await isRateLimited(userKey, 5, 300); // 5 requests per 5 minutes per user

    if (isUserLimited) {
      logger.warn(
        'User-based rate limit exceeded for 2FA password verification',
        {
          userId: session.user.id,
        },
      );
      return NextResponse.json(
        {
          message: t('validation.too_many_requests'),
        },
        { status: HttpStatus.TOO_MANY_REQUESTS },
      );
    }

    // Verify password
    const passwordMatch = verifyPassword(password, session.user.passwordHash!);

    if (!passwordMatch) {
      logger.warn('Failed 2FA password verification attempt', {
        userId: session.user.id,
        ip: ip || 'unknown',
      });
      return NextResponse.json(
        {
          message: t('validation.wrong_password'),
          field: 'password',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error(
      "Error occurred in 'two-factor/verify-password' route:",
      error,
    );
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
