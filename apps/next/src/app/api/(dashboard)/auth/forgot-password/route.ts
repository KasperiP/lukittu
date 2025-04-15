import prisma from '@/lib/database/prisma';
import { sendResetPasswordEmail } from '@/lib/emails/templates/send-forgot-password-email';
import { logger } from '@/lib/logging/logger';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { getIp, getLanguage } from '@/lib/utils/header-helpers';
import {
  forgotPasswordSchema,
  IForgotPasswordSchema,
} from '@/lib/validation/auth/forgot-password-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { JwtTypes } from '@/types/jwt-types-enum';
import { Provider } from '@lukittu/prisma';
import jwt from 'jsonwebtoken';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type IAuthForgotPasswordSuccessResponse = {
  success: boolean;
};

export type IAuthForgotPasswordResponse =
  | ErrorResponse
  | IAuthForgotPasswordSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IAuthForgotPasswordResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as IForgotPasswordSchema;
    const validated = await forgotPasswordSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { email } = validated.data;

    const ip = await getIp();
    if (ip) {
      const key = `forgot-password:${email}`;
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

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.emailVerified) {
      return NextResponse.json({
        success: true,
      });
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

    const token = jwt.sign(
      {
        userId: user.id,
        type: JwtTypes.PASSWORD_RESET,
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: '1h',
      },
    );

    const resetLink = `${process.env.NEXT_PUBLIC_BASE_URL}/auth/reset-password?token=${token}`;

    const success = await sendResetPasswordEmail({
      email,
      user,
      resetLink,
    });

    if (!success) {
      return NextResponse.json(
        {
          message: t('auth.emails.sending_failed_title'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error("Error occurred in 'forgot-password' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
