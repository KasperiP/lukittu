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

    // Consolidated RequestLog query: single scan of the 30-day range using the
    // (teamId, createdAt) index. Returns totals, by-type breakdown, top countries,
    // and recent activity windows all from one sequential scan.
    type RequestLogStats = {
      total: bigint;
      successful: bigint;
      failed: bigint;
      last_24h: bigint;
      last_7d: bigint;
      type: string;
      type_count: bigint;
      country: string | null;
      country_requests: bigint;
      country_rank: bigint;
    };

    const [
      totalLicenses,
      totalCustomers,
      totalProducts,
      activeLicensesResult,
      requestLogStats,
      topProductsResult,
    ] = await Promise.all([
      // 1. Total licenses count
      prisma.license.count({
        where: { teamId },
      }),

      // 2. Total customers count
      prisma.customer.count({
        where: { teamId },
      }),

      // 3. Total products count
      prisma.product.count({
        where: { teamId },
      }),

      // 4. Active licenses (distinct licenseIds in last hour) - separate small range scan
      prisma.$queryRaw<[{ count: bigint }]>(
        Prisma.sql`
          SELECT COUNT(DISTINCT "licenseId") as count
          FROM "RequestLog"
          WHERE "teamId" = ${teamId}
          AND "createdAt" >= ${hourAgo}
        `,
      ),

      // 5. Combined 30-day RequestLog stats
      prisma.$queryRaw<RequestLogStats[]>(
        Prisma.sql`
          WITH base AS (
            SELECT status, type, country, "createdAt"
            FROM "RequestLog"
            WHERE "teamId" = ${teamId}
            AND "createdAt" >= ${monthAgo}
          ),
          totals AS (
            SELECT
              COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'VALID') as successful,
              COUNT(*) FILTER (WHERE status != 'VALID') as failed,
              COUNT(*) FILTER (WHERE "createdAt" >= ${dayAgo}) as last_24h,
              COUNT(*) FILTER (WHERE "createdAt" >= ${weekAgo}) as last_7d
            FROM base
          ),
          by_type AS (
            SELECT type, COUNT(*) as type_count
            FROM base
            GROUP BY type
          ),
          by_country AS (
            SELECT
              country,
              COUNT(*) as country_requests,
              ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as country_rank
            FROM base
            WHERE country IS NOT NULL
            GROUP BY country
          )
          SELECT
            t.total, t.successful, t.failed, t.last_24h, t.last_7d,
            COALESCE(bt.type, '') as type,
            COALESCE(bt.type_count, 0) as type_count,
            bc.country,
            COALESCE(bc.country_requests, 0) as country_requests,
            COALESCE(bc.country_rank, 0) as country_rank
          FROM totals t
          LEFT JOIN by_type bt ON true
          LEFT JOIN by_country bc ON bc.country_rank <= 10
        `,
      ),

      // 6. Top 5 products by license count
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

    const firstRow = requestLogStats[0];
    const activeLicenses = Number(activeLicensesResult[0]?.count || 0);
    const totalRequests = Number(firstRow?.total || 0);
    const successfulRequests = Number(firstRow?.successful || 0);
    const failedRequests = Number(firstRow?.failed || 0);
    const successRate =
      totalRequests > 0
        ? Math.round((successfulRequests / totalRequests) * 10000) / 100
        : 0;

    const byType: Record<string, number> = {};
    for (const row of requestLogStats) {
      if (row.type && !byType[row.type]) {
        byType[row.type] = Number(row.type_count);
      }
    }

    const countrySeen = new Set<string>();
    const topCountries: Array<{
      country: string;
      alpha3: string;
      alpha2: string;
      requests: number;
    }> = [];
    for (const row of requestLogStats) {
      if (
        row.country &&
        Number(row.country_rank) > 0 &&
        !countrySeen.has(row.country)
      ) {
        countrySeen.add(row.country);
        topCountries.push({
          country: iso3ToName(row.country) ?? row.country,
          alpha3: row.country,
          alpha2: iso3toIso2(row.country) ?? row.country,
          requests: Number(row.country_requests),
        });
      }
    }
    topCountries.sort((a, b) => b.requests - a.requests);

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
          last24h: Number(firstRow?.last_24h || 0),
          last7d: Number(firstRow?.last_7d || 0),
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
