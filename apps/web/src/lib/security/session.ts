import { logger, prisma, Prisma } from '@lukittu/shared';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import 'server-only';
import { getCloudflareVisitorData } from '../providers/cloudflare';
import { iso2toIso3 } from '../utils/country-helpers';
import { getIp, getUserAgent } from '../utils/header-helpers';

export async function createSession(userId: string, rememberMe: boolean) {
  try {
    const ipAddress = await getIp();
    const userAgent = await getUserAgent();

    const geoData = await getCloudflareVisitorData();
    const countryAlpha3: string | null = geoData?.alpha2
      ? iso2toIso3(geoData.alpha2!)!
      : null;

    const sessionId = randomBytes(16).toString('hex');

    const expiresAt = rememberMe
      ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
      : new Date(Date.now() + 1000 * 60 * 60 * 24);

    const session = await prisma.session.create({
      data: {
        sessionId,
        userId,
        expiresAt,
        ipAddress,
        country: countryAlpha3,
        userAgent,
      },
    });

    (await cookies()).set('session', sessionId, {
      expires: expiresAt,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });

    return session;
  } catch (error) {
    logger.error('Error creating session', error);
    return null;
  }
}

export const getSession = cache(
  async <T extends Prisma.SessionInclude>(include: T | null = null) => {
    const sessionId = (await cookies()).get('session')?.value;

    if (!sessionId) return null;

    const session = await prisma.session.findUnique({
      where: {
        sessionId,
        expiresAt: {
          gte: new Date(),
        },
      },
      include,
    });

    if (!session) return null;

    // TODO: Improve type.
    return {
      ...session,
      sessionId,
    } as Prisma.SessionGetPayload<{ include: T }>;
  },
);
