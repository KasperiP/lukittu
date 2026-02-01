import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { iso3toIso2, iso3ToName } from '@/lib/utils/country-helpers';
import { getIp } from '@/lib/utils/header-helpers';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma, Prisma, redisClient, regex } from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const { teamId } = params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();

  try {
    logger.info('Dev API: Get statistics request started', {
      requestId,
      teamId,
      route: '/v1/dev/teams/[teamId]/statistics',
      method: 'GET',
      userAgent,
      timestamp: requestTime.toISOString(),
      ipAddress,
    });

    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Invalid teamId provided for statistics', {
        requestId,
        providedTeamId: teamId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid teamId',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.BAD_REQUEST,
        },
      );
    }

    const { team } = await verifyApiAuthorization(teamId);

    if (!team) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: API key authentication failed for statistics', {
        requestId,
        teamId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.UNAUTHORIZED,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid API key',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.UNAUTHORIZED,
        },
      );
    }

    // Check Redis cache
    const cacheKey = `dev_statistics:${teamId}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.info('Dev API: Statistics retrieved from cache', {
        requestId,
        teamId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.OK,
        cached: true,
      });

      return NextResponse.json(JSON.parse(cached));
    }

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalLicenses, totalCustomers, totalProducts, topProductsResult] =
      await Promise.all([
        prisma.license.count({
          where: { teamId },
        }),
        prisma.customer.count({
          where: { teamId },
        }),
        prisma.product.count({
          where: { teamId },
        }),
        prisma.product.findMany({
          where: { teamId },
          orderBy: {
            licenses: {
              _count: 'desc',
            },
          },
          take: 5,
          include: {
            _count: {
              select: {
                licenses: true,
              },
            },
          },
        }),
      ]);

    const requestTotalsResult = await prisma.$queryRaw<
      [
        {
          total: bigint;
          successful: bigint;
          failed: bigint;
          last_24h: bigint;
          last_7d: bigint;
          active_licenses: bigint;
        },
      ]
    >(
      Prisma.sql`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'VALID') as successful,
          COUNT(*) FILTER (WHERE status != 'VALID') as failed,
          COUNT(*) FILTER (WHERE "createdAt" >= ${dayAgo}) as last_24h,
          COUNT(*) FILTER (WHERE "createdAt" >= ${weekAgo}) as last_7d,
          COUNT(DISTINCT "licenseId") FILTER (WHERE "createdAt" >= ${hourAgo}) as active_licenses
        FROM "RequestLog"
        WHERE "teamId" = ${teamId}
        AND "createdAt" >= ${monthAgo}
      `,
    );

    // Requests by type
    const requestsByTypeResult = await prisma.$queryRaw<
      Array<{ type: string; count: bigint }>
    >(
      Prisma.sql`
        SELECT type::text, COUNT(*) as count
        FROM "RequestLog"
        WHERE "teamId" = ${teamId}
        AND "createdAt" >= ${monthAgo}
        GROUP BY type
      `,
    );

    // Top 10 countries
    const topCountriesResult = await prisma.$queryRaw<
      Array<{ country: string; requests: bigint }>
    >(
      Prisma.sql`
        SELECT "country", COUNT(*) as requests
        FROM "RequestLog"
        WHERE "teamId" = ${teamId}
        AND "createdAt" >= ${monthAgo}
        AND "country" IS NOT NULL
        GROUP BY "country"
        ORDER BY requests DESC
        LIMIT 10
      `,
    );

    const totals = requestTotalsResult[0];
    const activeLicenses = Number(totals?.active_licenses || 0);
    const totalRequests = Number(totals?.total || 0);
    const successfulRequests = Number(totals?.successful || 0);
    const failedRequests = Number(totals?.failed || 0);
    const successRate =
      totalRequests > 0
        ? Math.round((successfulRequests / totalRequests) * 10000) / 100
        : 0;

    const byType: Record<string, number> = {};
    for (const row of requestsByTypeResult) {
      byType[row.type] = Number(row.count);
    }

    const topCountries = topCountriesResult.map((row) => ({
      country: iso3ToName(row.country) ?? row.country,
      alpha3: row.country,
      alpha2: iso3toIso2(row.country) ?? row.country,
      requests: Number(row.requests),
    }));

    const topProducts = topProductsResult.map((product) => ({
      id: product.id,
      name: product.name,
      licenses: product._count.licenses,
    }));

    const response: IExternalDevResponse = {
      data: {
        overview: {
          totalLicenses,
          totalCustomers,
          totalProducts,
          activeLicenses,
          totalRequests,
        },
        requests: {
          total: totalRequests,
          successful: successfulRequests,
          failed: failedRequests,
          successRate,
          byType,
        },
        topCountries,
        topProducts,
        recentActivity: {
          last24h: Number(totals?.last_24h || 0),
          last7d: Number(totals?.last_7d || 0),
          last30d: totalRequests,
        },
      },
      result: {
        details: 'Statistics retrieved',
        timestamp: new Date(),
        valid: true,
      },
    };

    // Cache in Redis for 15 minutes
    await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 900);

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Statistics retrieved successfully', {
      requestId,
      teamId,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
      cached: false,
    });

    return NextResponse.json(response);
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Get statistics failed', {
      requestId,
      teamId,
      route: '/v1/dev/teams/[teamId]/statistics',
      error: error instanceof Error ? error.message : String(error),
      errorType: error?.constructor?.name || 'Unknown',
      responseTimeMs: responseTime,
      ipAddress,
      userAgent,
    });

    return NextResponse.json(
      {
        data: null,
        result: {
          details: 'Internal server error',
          timestamp: new Date(),
          valid: false,
        },
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      },
    );
  }
}
