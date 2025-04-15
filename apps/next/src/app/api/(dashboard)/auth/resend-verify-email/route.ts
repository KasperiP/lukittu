import prisma from '@/lib/database/prisma';
import { sendVerifyEmailEmail } from '@/lib/emails/templates/send-verify-email-email';
import { logger } from '@/lib/logging/logger';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { getIp, getLanguage } from '@/lib/utils/header-helpers';
import {
  resendVerifyEmailSchema,
  ResendVerifyEmailSchema,
} from '@/lib/validation/auth/resend-verify-email-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { JwtTypes } from '@/types/jwt-types-enum';
import { Provider } from '@lukittu/prisma';
import jwt from 'jsonwebtoken';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type IAuthResendVerifyEmailSuccessResponse = {
  success: boolean;
};

export type IAuthResendVerifyEmailResponse =
  | ErrorResponse
  | IAuthResendVerifyEmailSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IAuthResendVerifyEmailResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as ResendVerifyEmailSchema;
    const validated = await resendVerifyEmailSchema(t).safeParseAsync(body);

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
      const key = `resend-verify-email:${email}`;
      const isLimited = await isRateLimited(key, 5, 1800); // 5 requests per 30 minutes

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
      where: {
        email,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          message: t('validation.invalid_email'),
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

    if (user.emailVerified) {
      return NextResponse.json(
        {
          message: t('auth.resend_verify.already_verified'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const token = jwt.sign(
      {
        userId: user.id,
        type: JwtTypes.NEW_ACCOUNT_EMAIL_VERIFICATION,
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: '30m',
      },
    );

    const verifyLink = `${process.env.NEXT_PUBLIC_BASE_URL}/auth/verify-email?token=${token}`;

    const success = await sendVerifyEmailEmail({
      email,
      user,
      verifyLink,
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
    logger.error("Error occurred in 'resend-verify-email' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
