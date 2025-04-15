import prisma from '@/lib/database/prisma';
import { logger } from '@/lib/logging/logger';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { getIp, getLanguage } from '@/lib/utils/header-helpers';
import {
  verifyEmaiLSchema,
  VerifyEmailSchema,
} from '@/lib/validation/auth/verify-email-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { JwtTypes } from '@/types/jwt-types-enum';
import { Provider } from '@lukittu/prisma';
import jwt from 'jsonwebtoken';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type IAuthVerifyEmailSuccessResponse = {
  success: boolean;
};

export type IAuthVerifyEmailResponse =
  | ErrorResponse
  | IAuthVerifyEmailSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IAuthVerifyEmailResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as VerifyEmailSchema;
    const validated = await verifyEmaiLSchema(t).safeParseAsync(body);

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
      const key = `verify-email:${ip}`;
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

    const { token } = validated.data;

    let decodedToken: {
      userId: string;
      type: JwtTypes;
    };

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);

      if (typeof decoded === 'string') {
        return NextResponse.json(
          {
            message: t('validation.invalid_token'),
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }

      if (decoded.type !== JwtTypes.NEW_ACCOUNT_EMAIL_VERIFICATION) {
        return NextResponse.json(
          {
            message: t('validation.invalid_token'),
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }

      decodedToken = decoded as {
        userId: string;
        type: JwtTypes;
      };
    } catch (error) {
      logger.error("Error occurred in 'verify-email' route", error);
      if (error instanceof jwt.TokenExpiredError) {
        return NextResponse.json(
          {
            message: t('auth.emails.expired_link'),
          },
          { status: HttpStatus.GONE },
        );
      }

      return NextResponse.json(
        {
          message: t('validation.invalid_token'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: decodedToken.userId },
    });

    if (!user) {
      return NextResponse.json(
        {
          message: t('validation.user_not_found'),
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
          message: t('validation.email_already_verified'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error occurred in 'verify-email' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
