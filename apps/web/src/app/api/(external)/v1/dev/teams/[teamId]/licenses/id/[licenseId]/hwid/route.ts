import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { getIp } from '@/lib/utils/header-helpers';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, Prisma, prisma, regex } from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

type HwidStatus = 'active' | 'inactive' | 'forgotten';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ teamId: string; licenseId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();
  const { teamId, licenseId } = params;

  logger.info('Dev API: Get HWIDs request started', {
    requestId,
    teamId,
    licenseId,
    route: '/v1/dev/teams/[teamId]/licenses/id/[licenseId]/hwid',
    method: 'GET',
    userAgent,
    ipAddress,
    timestamp: requestTime.toISOString(),
  });

  try {
    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid teamId format provided for HWID retrieval',
        {
          requestId,
          providedTeamId: teamId,
          responseTimeMs: responseTime,
          statusCode: HttpStatus.BAD_REQUEST,
          ipAddress,
          userAgent,
        },
      );

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

    if (!licenseId || !regex.uuidV4.test(licenseId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid licenseId format provided for HWID retrieval',
        {
          requestId,
          teamId,
          providedLicenseId: licenseId,
          responseTimeMs: responseTime,
          statusCode: HttpStatus.BAD_REQUEST,
          ipAddress,
          userAgent,
        },
      );

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid licenseId',
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

      logger.warn('Dev API: API key authentication failed for HWID retrieval', {
        requestId,
        teamId,
        licenseId,
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

    // Verify the license exists and belongs to this team
    const licenseExists = await prisma.license.findUnique({
      where: {
        id: licenseId,
        teamId,
      },
      select: {
        id: true,
      },
    });

    if (!licenseExists) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: License not found for HWID retrieval', {
        requestId,
        teamId,
        licenseId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.NOT_FOUND,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'License not found',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.NOT_FOUND,
        },
      );
    }

    const searchParams = request.nextUrl.searchParams;

    const allowedPageSizes = [10, 25, 50, 100];
    const allowedSortDirections = ['asc', 'desc'];
    const allowedSortColumns = ['lastSeenAt', 'createdAt'];

    let page = parseInt(searchParams.get('page') as string) || 1;
    let pageSize = parseInt(searchParams.get('pageSize') as string) || 25;
    let sortColumn = searchParams.get('sortColumn') as string;
    let sortDirection = searchParams.get('sortDirection') as 'asc' | 'desc';
    const showForgotten = searchParams.get('showForgotten') === 'true';

    if (!allowedSortDirections.includes(sortDirection)) {
      sortDirection = 'desc';
    }

    if (!sortColumn || !allowedSortColumns.includes(sortColumn)) {
      sortColumn = 'lastSeenAt';
    }

    if (!allowedPageSizes.includes(pageSize)) {
      pageSize = 25;
    }

    if (page < 1) {
      page = 1;
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where = {
      ...(showForgotten ? {} : { forgotten: false }),
      licenseId,
      teamId,
    } as Prisma.HardwareIdentifierWhereInput;

    const [hardwareIdentifiers, totalResults] = await Promise.all([
      prisma.hardwareIdentifier.findMany({
        where,
        orderBy: {
          [sortColumn]: sortDirection,
        },
        skip,
        take,
      }),
      prisma.hardwareIdentifier.count({
        where,
      }),
    ]);

    const formattedHwids = hardwareIdentifiers.map((hwid) => {
      if (hwid.forgotten) {
        return {
          ...hwid,
          status: 'forgotten' as HwidStatus,
        };
      }

      const hwidTimeout = team.settings?.hwidTimeout || null;

      const lastSeenAt = new Date(hwid.lastSeenAt);
      const now = new Date();

      const diff = Math.abs(now.getTime() - lastSeenAt.getTime());
      const minutes = Math.floor(diff / 1000 / 60);

      const status: HwidStatus = hwidTimeout
        ? minutes <= hwidTimeout
          ? 'active'
          : 'inactive'
        : 'active';

      return {
        ...hwid,
        status,
      };
    });

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Get HWIDs completed successfully', {
      requestId,
      teamId,
      licenseId,
      hwidCount: formattedHwids.length,
      totalResults,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(
      {
        data: {
          hwids: formattedHwids,
          totalResults,
          hasNextPage: skip + take < totalResults,
        },
        result: {
          details: 'Hardware identifiers retrieved successfully',
          timestamp: new Date(),
          valid: true,
        },
      },
      {
        status: HttpStatus.OK,
      },
    );
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Get HWIDs failed', {
      requestId,
      teamId,
      licenseId,
      route: '/v1/dev/teams/[teamId]/licenses/id/[licenseId]/hwid',
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
