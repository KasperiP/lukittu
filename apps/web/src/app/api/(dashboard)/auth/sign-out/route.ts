import { getLanguage } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma } from '@lukittu/shared';
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
      await prisma.session.deleteMany({
        where: { sessionId },
      });
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error("Error occurred in 'sign-out' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
