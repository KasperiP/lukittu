import TeamInviteEmailTemplate from '@/emails/TeamInviteTemplate';
import { Session, Team } from '@lukittu/prisma';
import { render } from '@react-email/components';
import 'server-only';
import { logger } from '../../logging/logger';
import { sendEmail } from '../nodemailer';

interface SendTeamInviteEmailProps {
  email: string;
  inviteLink: string;
  session: Session & { user: { fullName: string } };
  team: Team;
}

export const sendTeamInviteEmail = async ({
  email,
  inviteLink,
  session,
  team,
}: SendTeamInviteEmailProps) => {
  try {
    const html = await render(
      TeamInviteEmailTemplate({
        inviteLink,
        senderName: session.user.fullName,
        teamName: team.name,
      }),
    );

    const text = await render(
      TeamInviteEmailTemplate({
        inviteLink,
        senderName: session.user.fullName,
        teamName: team.name,
      }),
      {
        plainText: true,
      },
    );

    const success = await sendEmail({
      to: email,
      subject: 'You have been invited to join a team on Lukittu',
      html,
      text,
    });

    return success;
  } catch (error) {
    logger.error('Error sending team invite email', error);
    return false;
  }
};
