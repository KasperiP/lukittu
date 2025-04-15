import prisma from '@/lib/database/prisma';
import { logger } from '@/lib/logging/logger';
import { hashPassword, verifyPassword } from '@/lib/security/crypto';
import { getSession } from '@/lib/security/session';
import { getLanguage } from '@/lib/utils/header-helpers';
import {
  changePasswordSchema,
  ChangePasswordSchema,
} from '@/lib/validation/profile/change-password-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { Provider } from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export interface IUsersChangePasswordSuccessResponse {
  success: boolean;
}

export type IUsersChangePasswordResponse =
  | ErrorResponse
  | IUsersChangePasswordSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IUsersChangePasswordResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as ChangePasswordSchema & {
      token: string;
    };
    const validated = await changePasswordSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { password, newPassword } = body;

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

    const passwordMatch = verifyPassword(password, session.user.passwordHash!);

    if (!passwordMatch) {
      return NextResponse.json(
        {
          message: t('validation.wrong_password'),
          field: 'password',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const passwordHash = hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: session.user.id,
        },
        data: {
          passwordHash,
        },
      }),
      prisma.session.deleteMany({
        where: {
          userId: session.user.id,
          sessionId: {
            not: session.sessionId,
          },
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error occurred in 'change-password' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
