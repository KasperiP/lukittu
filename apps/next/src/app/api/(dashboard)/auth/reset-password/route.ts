import prisma from '@/lib/database/prisma';
import { logger } from '@/lib/logging/logger';
import { hashPassword } from '@/lib/security/crypto';
import { getLanguage } from '@/lib/utils/header-helpers';
import {
  ResetPasswordSchema,
  resetPasswordSchema,
} from '@/lib/validation/auth/reset-password-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { JwtTypes } from '@/types/jwt-types-enum';
import { Provider } from '@lukittu/prisma';
import jwt from 'jsonwebtoken';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type IAuthResetPasswordSuccessResponse = {
  success: boolean;
};

export type IAuthResetPasswordResponse =
  | ErrorResponse
  | IAuthResetPasswordSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IAuthResetPasswordResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as ResetPasswordSchema & {
      token: string;
    };
    const validated = await resetPasswordSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (!body.token) {
      return NextResponse.json(
        {
          message: t('validation.invalid_token'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { token, password } = body;

    if (typeof token !== 'string') {
      return NextResponse.json(
        {
          message: t('validation.invalid_token'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

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

      if (decoded.type !== JwtTypes.PASSWORD_RESET) {
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
      logger.error('Error verifying token in reset-password route', error);
      if (error instanceof jwt.TokenExpiredError) {
        return NextResponse.json(
          {
            message: t('auth.emails.expired_link'),
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }

      return NextResponse.json(
        {
          message: t('validation.invalid_token'),
        },
        { status: HttpStatus.BAD_REQUEST },
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

    const passwordHash = hashPassword(password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      prisma.session.deleteMany({
        where: { userId: user.id },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error occurred in 'reset-password' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
