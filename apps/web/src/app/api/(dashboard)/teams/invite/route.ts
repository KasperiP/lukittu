import { sendTeamInviteEmail } from '@/lib/emails/templates/send-team-invite-email';
import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  inviteMemberSchema,
  InviteMemberSchema,
} from '@/lib/validation/team/invite-member-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogTargetType,
  logger,
  prisma,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type ITeamsInviteSuccessResponse = {
  success: boolean;
};

export type ITeamsInviteResponse = ErrorResponse | ITeamsInviteSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ITeamsInviteResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as InviteMemberSchema;
    const validated = await inviteMemberSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const email = body.email;

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
              users: true,
              limits: true,
              invitations: {
                where: {
                  createdAt: {
                    gte: new Date(new Date().getTime() - 24 * 60 * 60 * 1000), // 24 hours
                  },
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

    if (!team.limits) {
      // Should never happen
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (team.users.length >= team.limits.maxTeamMembers) {
      return NextResponse.json(
        {
          message: t('validation.max_team_members_reached'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (team.invitations.length >= team.limits.maxInvitations) {
      return NextResponse.json(
        {
          message: t('validation.max_invitations_reached'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (team.ownerId !== session.user.id) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (team.users.find((user) => user.email === email)) {
      return NextResponse.json(
        {
          message: t('validation.user_already_in_team'),
          field: 'email',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    let existingInvitation = false;
    const existingEmailInvitations = team.invitations.filter(
      (invitation) => invitation.email === email,
    );
    if (existingEmailInvitations.length) {
      const latestInvitation = existingEmailInvitations.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )[0];
      if (
        new Date().getTime() - latestInvitation.createdAt.getTime() <
        15 * 60 * 1000 // 15 minutes
      ) {
        return NextResponse.json(
          {
            message: t('validation.invitation_already_sent'),
            field: 'email',
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      } else {
        existingInvitation = true;
      }
    }

    const invitation = await prisma.$transaction(async (prisma) => {
      if (existingInvitation) {
        await prisma.invitation.deleteMany({
          where: {
            email,
            teamId: team.id,
          },
        });
      }

      const invitation = await prisma.invitation.create({
        data: {
          email,
          teamId: team.id,
          createdByUserId: session.user.id,
        },
      });

      return invitation;
    });

    const inviteLink = `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard?invite=${invitation.id}`;

    const success = await sendTeamInviteEmail({
      email,
      inviteLink,
      session,
      team,
    });

    if (!success) {
      return NextResponse.json(
        {
          message: t('auth.emails.sending_failed_title'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }

    const response = {
      success: true,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: team.id,
      action: AuditLogAction.INVITE_MEMBER,
      targetId: invitation.id,
      targetType: AuditLogTargetType.TEAM,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response, { status: HttpStatus.OK });
  } catch (error) {
    logger.error("Error occurred in 'teams/invite' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
