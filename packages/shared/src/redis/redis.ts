import Redis from 'ioredis';
import { logger } from '../server';

declare global {
  var redis: Redis | undefined;
}

const redisClient =
  global.redis ||
  new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
    password: process.env.REDIS_PASSWORD,
    lazyConnect: true,
  });

if (process.env.NODE_ENV === 'development') {
  global.redis = redisClient;
}

redisClient.on('error', (err) => {
  logger.error('Redis error:', err);
});

export { redisClient };
