import { logger, regex } from '@lukittu/shared';
import 'server-only';
import { redisClient } from '../database/redis';

export async function isRateLimited(
  key: string,
  maxRequests: number,
  limitWindow: number,
) {
  const rateLimitKey = `rate_limit:${key}`;

  try {
    const currentCount = await redisClient.get(rateLimitKey);

    const currentRequests = currentCount ? parseInt(currentCount) : 0;

    if (currentCount) {
      const currentExpiration = await redisClient.ttl(rateLimitKey);
      limitWindow = currentExpiration > 0 ? currentExpiration : limitWindow;
    }

    await redisClient.set(rateLimitKey, currentRequests + 1, 'EX', limitWindow);

    const isRateLimited = currentRequests >= maxRequests;

    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isRateLimited) {
      if (isDevelopment) {
        logger.info(
          `Rate limit exceeded for ${key} but allowing in development`,
        );
        return false;
      }

      return true;
    }

    return false;
  } catch (error) {
    logger.error('Error checking rate limit', error);
    return false;
  }
}

export function isTrustedSource(licenseKey: string, teamId: string): boolean {
  if (!regex.licenseKey.test(licenseKey) || !regex.uuidV4.test(teamId)) {
    logger.info(
      `Invalid licenseKey or teamId format: ${licenseKey}, ${teamId}`,
    );
    return false;
  }

  const trustedLicenseKeys = process.env.TRUSTED_LICENSE_KEYS?.split(',') || [];
  const trustedTeamIds = process.env.TRUSTED_TEAM_IDS?.split(',') || [];

  if (
    trustedLicenseKeys.includes(licenseKey) &&
    trustedTeamIds.includes(teamId)
  ) {
    logger.info(`Trusted source: licenseKey=${licenseKey}, teamId=${teamId}`);
    return true;
  }

  return false;
}
