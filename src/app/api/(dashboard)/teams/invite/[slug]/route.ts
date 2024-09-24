import { regex } from '@/lib/constants/regex';
import prisma from '@/lib/database/prisma';
import { getSession } from '@/lib/utils/auth';
import { getLanguage } from '@/lib/utils/header-helpers';
import { logger } from '@/lib/utils/logger';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type ITeamsInviteSuccessResponse = {
  success: boolean;
};

export type ITeamsInviteResponse = ErrorResponse | ITeamsInviteSuccessResponse;

export async function POST(
  _: NextRequest,
  { params }: { params: { slug: string } },
): Promise<NextResponse<ITeamsInviteResponse>> {
  const t = await getTranslations({ locale: getLanguage() });

  try {
    const invitationId = params.slug;

    if (!invitationId || !regex.uuidV4.test(invitationId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const session = await getSession({ user: true });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    const invitation = await prisma.invitation.findUnique({
      where: {
        id: invitationId,
        createdAt: {
          gte: new Date(new Date().getTime() - 24 * 60 * 60 * 1000), // 24 hours
        },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        {
          message: t('validation.invitation_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (invitation.email !== session.user.email) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (invitation.accepted) {
      return NextResponse.json(
        {
          message: t('validation.invitation_already_accepted'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    await prisma.$transaction(async (prisma) => {
      await prisma.invitation.update({
        where: {
          id: invitationId,
        },
        data: {
          accepted: true,
        },
      });

      await prisma.team.update({
        where: {
          id: invitation.teamId,
        },
        data: {
          users: {
            connect: {
              email: session.user.email,
            },
          },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error occurred in 'teams/invite/[slug]' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
