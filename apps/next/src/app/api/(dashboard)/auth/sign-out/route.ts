import prisma from '@/lib/database/prisma';
import { logger } from '@/lib/logging/logger';
import { getLanguage } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { Prisma } from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

type IAuthSignOutSuccessResponse = {
  success: boolean;
};

export type IAuthSignOutResponse = ErrorResponse | IAuthSignOutSuccessResponse;

export async function POST(): Promise<NextResponse<IAuthSignOutResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  const sessionId = (await cookies()).get('session')?.value;

  (await cookies()).set('session', '', {
    expires: new Date(0),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  try {
    if (sessionId) {
      await prisma.session.delete({
        where: { sessionId },
      });
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    // Prisma throws a known error when the session does not exist when trying to delete it
    // We can safely ignore this error and return a success response
    const allowedErrors = ['P2025', 'P2016'];
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      allowedErrors.includes(error.code)
    ) {
      return NextResponse.json({
        success: true,
      });
    }

    logger.error("Error occurred in 'sign-out' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
