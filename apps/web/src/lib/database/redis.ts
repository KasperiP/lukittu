import { logger } from '@lukittu/shared';
import Redis from 'ioredis';
import 'server-only';

const redisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
  lazyConnect: true,
});

redisClient.on('error', (err) => logger.error('Redis error', err));

logger.info('Connecting to Redis');
redisClient.connect();

export { redisClient };
