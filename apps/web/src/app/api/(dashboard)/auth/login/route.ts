import { verifyTurnstileToken } from '@/lib/providers/cloudflare';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { createSession } from '@/lib/security/session';
import { getIp, getLanguage } from '@/lib/utils/header-helpers';
import { loginSchema, LoginSchema } from '@/lib/validation/auth/login-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma, Provider, verifyPassword } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type IAuthLoginSuccessResponse = {
  success: boolean;
};

export type IAuthLoginResponse = ErrorResponse | IAuthLoginSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IAuthLoginResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as LoginSchema;
    const validated = await loginSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const ip = await getIp();
    if (ip) {
      const key = `login:${ip}`;
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

    const { email, password, rememberMe, token } = validated.data;

    const turnstileValid = await verifyTurnstileToken(token);

    if (!turnstileValid) {
      return NextResponse.json(
        {
          message: t('validation.invalid_turnstile_token'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      omit: {
        passwordHash: false,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          message: t('auth.login.invalid_email_password'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (user.provider !== Provider.CREDENTIALS) {
      return NextResponse.json(
        {
          message: t('general.wrong_provider', {
            provider: t(`auth.oauth.${user.provider.toLowerCase()}` as any),
          }),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (!user.emailVerified) {
      return NextResponse.json(
        {
          message: t('auth.login.email_not_verified'),
          reverifyEmail: true,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const passwordMatch = verifyPassword(password, user.passwordHash!);

    if (!passwordMatch) {
      return NextResponse.json(
        {
          message: t('auth.login.invalid_email_password'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const session = await createSession(user.id, rememberMe);

    if (!session) {
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error("Error occurred in 'login' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
