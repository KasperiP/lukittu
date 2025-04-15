import { logger } from '@/lib/logging/logger';
import { getSession } from '@/lib/security/session';
import { getLanguage } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  DiscordAccount,
  Limits,
  Session,
  Subscription,
  Team,
  User,
} from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';

export type ISessionsGetCurrentSuccessResponse = {
  session: Omit<Session, 'sessionId'> & {
    user: Omit<User, 'passwordHash'> & {
      discordAccount: DiscordAccount | null;
      teams: (Team & {
        subscription: Subscription | null;
        limits: Limits | null;
      })[];
    };
  };
};

export type ISessionsGetCurrentResponse =
  | ISessionsGetCurrentSuccessResponse
  | ErrorResponse;

export async function GET(): Promise<
  NextResponse<ISessionsGetCurrentResponse>
> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const session = await getSession({
      user: {
        include: {
          discordAccount: true,
          teams: {
            where: {
              deletedAt: null,
            },
            include: {
              subscription: true,
              limits: true,
            },
          },
        },
      },
    });

    if (!session?.user) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    const response = {
      session,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'sessions/current' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
