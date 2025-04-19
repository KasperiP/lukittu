import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogTargetType,
  logger,
  prisma,
  regex,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type ITeamsMembersKickSuccessResponse = {
  success: true;
};

export type ITeamsMembersKickResponse =
  | ErrorResponse
  | ITeamsMembersKickSuccessResponse;

export async function DELETE(
  _: NextRequest,
  props: { params: Promise<{ slug: string }> },
) {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const memberId = params.slug;

    if (!memberId || !regex.uuidV4.test(memberId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              id: selectedTeam,
              deletedAt: null,
            },
            include: {
              users: {
                where: {
                  id: memberId,
                },
              },
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

    if (!session.user.teams.length) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const team = session.user.teams[0];

    if (team.ownerId !== session.user.id) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (!team.users.length) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const user = team.users[0];

    if (user.id === session.user.id) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    await prisma.team.update({
      where: {
        id: selectedTeam,
      },
      data: {
        users: {
          disconnect: {
            id: memberId,
          },
        },
      },
    });

    const response = {
      success: true,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: team.id,
      action: AuditLogAction.KICK_MEMBER,
      targetId: memberId,
      targetType: AuditLogTargetType.TEAM,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'teams/members/[slug]' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
