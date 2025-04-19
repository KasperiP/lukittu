import { getSession } from '@/lib/security/session';
import { iso3toIso2, iso3ToName } from '@/lib/utils/country-helpers';
import { getLanguage } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma, Session } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { UAParser } from 'ua-parser-js';

export type ISessionsGetSuccessResponse = {
  sessions: (Omit<Session, 'sessionId'> & {
    current: boolean;
    alpha2: string | null;
    alpha3: string | null;
    country: string | null;
    browser: string | null;
    os: string | null;
  })[];
};

export type ISessionsGetResponse = ErrorResponse | ISessionsGetSuccessResponse;

export async function GET(): Promise<NextResponse<ISessionsGetResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const sessionId = (await cookies()).get('session')?.value;
    const session = await getSession({
      user: {
        include: {
          sessions: {
            orderBy: {
              createdAt: 'desc',
            },
            omit: {
              sessionId: false,
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

    const sessions = session.user.sessions.map((s) => {
      let browser: string | null = null;
      let os: string | null = null;

      if (s.userAgent) {
        const parser = new UAParser(s.userAgent);
        const browserObj = parser.getBrowser();
        const osObj = parser.getOS();

        browser = browserObj.name ?? null;
        os = osObj.name ?? null;
      }

      return {
        ...s,
        current: s.sessionId === sessionId,
        sessionId: undefined,
        country: iso3ToName(session.country),
        alpha3: session.country ?? null,
        browser,
        os,
        alpha2: iso3toIso2(session.country),
      };
    });

    return NextResponse.json({
      sessions,
    });
  } catch (error) {
    logger.error("Error occurred in 'sessions' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

type ISessionsSignOutAllSuccessResponse = {
  success: boolean;
};

export type ISessionsSignOutAllResponse =
  | ErrorResponse
  | ISessionsSignOutAllSuccessResponse;

export async function DELETE(): Promise<
  NextResponse<ISessionsSignOutAllResponse>
> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const session = await getSession({ user: true });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    await prisma.session.deleteMany({
      where: {
        userId: session.user.id,
        sessionId: {
          not: session.sessionId,
        },
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error("Error occurred in 'sessions' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
