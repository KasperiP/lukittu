import { logger } from '@lukittu/shared';
import { redisClient } from '../database/redis';
import { isRateLimited } from './rate-limiter';

jest.mock('../database/redis', () => ({
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    ttl: jest.fn(),
  },
}));

jest.mock('@lukittu/shared', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('Rate Limiting', () => {
  const testKey = 'test-key';
  const maxRequests = 5;
  const limitWindow = 60; // seconds

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isRateLimited', () => {
    it('should return false for first request', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      const result = await isRateLimited(testKey, maxRequests, limitWindow);

      expect(result).toBe(false);
      expect(redisClient.get).toHaveBeenCalledWith(`rate_limit:${testKey}`);
      expect(redisClient.set).toHaveBeenCalledWith(
        `rate_limit:${testKey}`,
        1,
        'EX',
        limitWindow,
      );
    });

    it('should return false when below max requests', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue('3');
      (redisClient.ttl as jest.Mock).mockResolvedValue(30);
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      const result = await isRateLimited(testKey, maxRequests, limitWindow);

      expect(result).toBe(false);
      expect(redisClient.set).toHaveBeenCalledWith(
        `rate_limit:${testKey}`,
        4,
        'EX',
        30,
      );
    });

    it('should return true when max requests reached', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue('5');
      (redisClient.ttl as jest.Mock).mockResolvedValue(30);
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      const result = await isRateLimited(testKey, maxRequests, limitWindow);

      expect(result).toBe(true);
      expect(redisClient.set).toHaveBeenCalledWith(
        `rate_limit:${testKey}`,
        6,
        'EX',
        30,
      );
    });

    it('should use original window when TTL is expired', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue('3');
      (redisClient.ttl as jest.Mock).mockResolvedValue(-1);
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      const result = await isRateLimited(testKey, maxRequests, limitWindow);

      expect(result).toBe(false);
      expect(redisClient.set).toHaveBeenCalledWith(
        `rate_limit:${testKey}`,
        4,
        'EX',
        limitWindow,
      );
    });

    it('should handle invalid count in Redis', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue('invalid');
      (redisClient.ttl as jest.Mock).mockResolvedValue(30);
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      const result = await isRateLimited(testKey, maxRequests, limitWindow);

      expect(result).toBe(false);
      expect(redisClient.set).toHaveBeenCalledWith(
        `rate_limit:${testKey}`,
        NaN,
        'EX',
        30,
      );
    });

    it('should handle Redis get error', async () => {
      (redisClient.get as jest.Mock).mockRejectedValue(
        new Error('Redis error'),
      );

      const result = await isRateLimited(testKey, maxRequests, limitWindow);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Error checking rate limit',
        expect.any(Error),
      );
      expect(redisClient.set).not.toHaveBeenCalled();
    });

    it('should handle Redis set error', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue('3');
      (redisClient.ttl as jest.Mock).mockResolvedValue(30);
      (redisClient.set as jest.Mock).mockRejectedValue(
        new Error('Redis error'),
      );

      const result = await isRateLimited(testKey, maxRequests, limitWindow);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Error checking rate limit',
        expect.any(Error),
      );
    });

    it('should handle Redis ttl error', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue('3');
      (redisClient.ttl as jest.Mock).mockRejectedValue(
        new Error('Redis error'),
      );

      const result = await isRateLimited(testKey, maxRequests, limitWindow);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Error checking rate limit',
        expect.any(Error),
      );
    });

    it('should properly format rate limit key', async () => {
      const specialKey = 'user:123:api';
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      await isRateLimited(specialKey, maxRequests, limitWindow);

      expect(redisClient.get).toHaveBeenCalledWith(`rate_limit:${specialKey}`);
      expect(redisClient.set).toHaveBeenCalledWith(
        `rate_limit:${specialKey}`,
        1,
        'EX',
        limitWindow,
      );
    });

    it('should handle floating point values in Redis', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue('3.14');
      (redisClient.ttl as jest.Mock).mockResolvedValue(30);
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      const result = await isRateLimited(testKey, maxRequests, limitWindow);

      expect(result).toBe(false);
      expect(redisClient.set).toHaveBeenCalledWith(
        `rate_limit:${testKey}`,
        4,
        'EX',
        30,
      );
    });
  });
});
