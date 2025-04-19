import { Limits, logger, prisma, regex, Team } from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import 'server-only';

type TeamWithLimits = Team & { limits: Limits };

export const verifyApiAuthorization = async (
  teamId: string,
): Promise<{ team: TeamWithLimits | null }> => {
  try {
    if (!regex.uuidV4.test(teamId)) {
      return { team: null };
    }

    const headersList = await headers();
    const authHeader = headersList.get('authorization');

    if (!authHeader?.toLowerCase().startsWith('bearer ')) {
      return { team: null };
    }

    const providedKey = authHeader.substring(7);
    const hashedProvidedKey = crypto
      .createHash('sha256')
      .update(providedKey)
      .digest('hex');

    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
        deletedAt: null,
      },
      include: {
        apiKeys: {
          where: {
            key: hashedProvidedKey,
          },
          omit: {
            key: false,
          },
        },
        limits: true,
        settings: true,
      },
    });

    if (!team || !team.apiKeys.length) {
      return { team: null };
    }

    if (!team.limits) {
      logger.error('No limits found for team', teamId);
      return { team: null };
    }

    return { team } as { team: TeamWithLimits };
  } catch (error) {
    logger.error('Error in verifyApiAuthorization', error);
    return { team: null };
  }
};
