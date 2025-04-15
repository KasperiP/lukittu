import { regex } from '@/lib/constants/regex';
import prisma from '@/lib/database/prisma';
import { createAuditLog } from '@/lib/logging/audit-log';
import { logger } from '@/lib/logging/logger';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { AuditLogAction, AuditLogTargetType, Team } from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type ITeamsAcceptInviteSuccessResponse = {
  team: Team;
};

export type ITeamsAcceptInviteResponse =
  | ErrorResponse
  | ITeamsAcceptInviteSuccessResponse;

export async function POST(
  _: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ITeamsAcceptInviteResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

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
      include: {
        team: {
          include: {
            users: true,
            limits: true,
          },
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
          message: t('validation.invitation_for_different_email'),
        },
        { status: HttpStatus.BAD_REQUEST },
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

    if (!invitation.team.limits) {
      // Should never happen (unless the team was deleted)
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (invitation.team.users.length >= invitation.team.limits.maxTeamMembers) {
      return NextResponse.json(
        {
          message: t('validation.max_team_members_reached_invite'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const team = await prisma.$transaction(async (prisma) => {
      await prisma.invitation.update({
        where: {
          id: invitationId,
        },
        data: {
          accepted: true,
        },
      });

      const team = await prisma.team.update({
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

      return team;
    });

    const response = {
      team,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: team.id,
      action: AuditLogAction.ACCEPT_INVITATION,
      targetId: invitation.id,
      targetType: AuditLogTargetType.TEAM,
      responseBody: response,
    });

    return NextResponse.json(response);
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

export type ITeamsInviteCancelSuccessResponse = {
  success: boolean;
};

export type ITeamsInviteCancelResponse =
  | ErrorResponse
  | ITeamsInviteCancelSuccessResponse;

export async function DELETE(
  _: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ITeamsInviteCancelResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

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

    const invitation = await prisma.invitation.findUnique({
      where: {
        id: invitationId,
        teamId: selectedTeam,
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

    if (invitation.accepted) {
      return NextResponse.json(
        {
          message: t('validation.invitation_already_accepted'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    await prisma.invitation.delete({
      where: {
        id: invitationId,
        teamId: selectedTeam,
      },
    });

    const response = {
      success: true,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: team.id,
      action: AuditLogAction.CANCEL_INVITATION,
      targetId: invitation.id,
      targetType: AuditLogTargetType.TEAM,
      responseBody: response,
    });

    return NextResponse.json(response);
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
