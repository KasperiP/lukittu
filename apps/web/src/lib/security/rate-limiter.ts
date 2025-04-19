import { logger } from '@lukittu/shared';
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
