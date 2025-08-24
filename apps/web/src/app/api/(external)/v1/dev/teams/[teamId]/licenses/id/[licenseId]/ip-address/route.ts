import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { iso3toIso2, iso3ToName } from '@/lib/utils/country-helpers';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, Prisma, prisma, regex } from '@lukittu/shared';
import { NextRequest, NextResponse } from 'next/server';

type IpStatus = 'active' | 'inactive' | 'forgotten';

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
    } as Prisma.IpAddressWhereInput;

    const [ipAddresses, totalResults] = await Promise.all([
      prisma.ipAddress.findMany({
        where,
        orderBy: {
          [sortColumn]: sortDirection,
        },
        skip,
        take,
      }),
      prisma.ipAddress.count({
        where,
      }),
    ]);

    const formattedIpAddresses = ipAddresses.map((ip) => {
      if (ip.forgotten) {
        return {
          ...ip,
          country: iso3ToName(ip.country),
          alpha2: ip.country ? iso3toIso2(ip.country) : null,
          alpha3: ip.country ?? null,
          status: 'forgotten' as IpStatus,
        };
      }

      const ipAddressTimeout = team.settings?.ipTimeout || null;

      const lastSeenAt = new Date(ip.lastSeenAt);
      const now = new Date();

      const diff = Math.abs(now.getTime() - lastSeenAt.getTime());
      const minutes = Math.floor(diff / 1000 / 60);

      const status: IpStatus = ipAddressTimeout
        ? minutes <= ipAddressTimeout
          ? 'active'
          : 'inactive'
        : 'active';

      return {
        ...ip,
        country: iso3ToName(ip.country),
        alpha2: ip.country ? iso3toIso2(ip.country) : null,
        alpha3: ip.country ?? null,
        status,
      };
    });

    return NextResponse.json(
      {
        data: {
          ipAddresses: formattedIpAddresses,
          totalResults,
          hasNextPage: skip + take < totalResults,
        },
        result: {
          details: 'IP addresses retrieved successfully',
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
      "Error in '(external)/v1/dev/teams/[teamId]/licenses/id/[licenseId]/ip-address' route",
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
