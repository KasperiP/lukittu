import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, Prisma, prisma, regex } from '@lukittu/shared';
import { NextRequest, NextResponse } from 'next/server';

type HwidStatus = 'active' | 'inactive' | 'forgotten';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ teamId: string; licenseId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId, licenseId } = params;

    if (!teamId || !regex.uuidV4.test(teamId)) {
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
      teamId,
      licenseId,
      ...(showForgotten ? {} : { forgotten: false }),
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

    // Get team settings for timeout calculation
    const teamSettings = await prisma.settings.findUnique({
      where: {
        teamId,
      },
      select: {
        hwidTimeout: true,
      },
    });

    if (!teamSettings) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Team settings not found',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.NOT_FOUND,
        },
      );
    }

    const formattedHwids = hardwareIdentifiers.map((hwid) => {
      if (hwid.forgotten) {
        return {
          ...hwid,
          status: 'forgotten' as HwidStatus,
        };
      }

      const hwidTimeout = teamSettings?.hwidTimeout || null;

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
    logger.error(
      "Error in '(external)/v1/dev/teams/[teamId]/licenses/id/[licenseId]/hwid' route",
      error,
    );
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
