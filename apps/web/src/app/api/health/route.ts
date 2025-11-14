import { HttpStatus } from '@/types/http-status';
import { logger, prisma, redisClient } from '@lukittu/shared';
import { existsSync } from 'fs';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if container is draining
    const isDraining = existsSync('/tmp/drain');

    if (isDraining) {
      logger.info(
        'Health check - Container is draining, returning unhealthy status',
      );
      return NextResponse.json(
        {
          status: 'draining',
          message: 'Container is being gracefully drained',
          timestamp: new Date().toISOString(),
        },
        { status: HttpStatus.SERVICE_UNAVAILABLE },
      );
    }

    const checks = {
      api: 'ok',
      database: 'checking',
      redis: 'checking',
      timestamp: new Date().toISOString(),
    };

    // Check database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch (error) {
      checks.database = 'error';
      logger.error('Health check - Database error:', error);
    }

    // Check Redis connection
    try {
      await redisClient.ping();
      checks.redis = 'ok';
    } catch (error) {
      checks.redis = 'error';
      logger.error('Health check - Redis error:', error);
    }

    // Determine overall health
    const isHealthy = checks.database === 'ok' && checks.redis === 'ok';
    const statusCode = isHealthy
      ? HttpStatus.OK
      : HttpStatus.SERVICE_UNAVAILABLE;

    return NextResponse.json(
      {
        status: isHealthy ? 'healthy' : 'degraded',
        checks,
      },
      { status: statusCode },
    );
  } catch (error) {
    logger.error('Health check failed:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: HttpStatus.SERVICE_UNAVAILABLE },
    );
  }
}
