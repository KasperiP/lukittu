import { getSession } from '@/lib/security/session';
import { iso3toIso2, iso3ToName } from '@/lib/utils/country-helpers';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { IpAddress, logger, Prisma, prisma, regex } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type IpStatus = 'active' | 'inactive';

export type ILicenseIpAddressGetSuccessResponse = {
  ipAddresses: (IpAddress & {
    status: IpStatus;
    alpha2: string | null;
    alpha3: string | null;
  })[];
  totalResults: number;
};

export type ILicenseIpAddressGetResponse =
  | ErrorResponse
  | ILicenseIpAddressGetSuccessResponse;

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ILicenseIpAddressGetResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const searchParams = request.nextUrl.searchParams;
    const selectedTeam = await getSelectedTeam();
    const licenseId = params.slug;

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (!regex.uuidV4.test(licenseId)) {
      return NextResponse.json(
        {
          message: t('validation.license_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const allowedPageSizes = [10, 25, 50, 100];
    const allowedSortDirections = ['asc', 'desc'];
    const allowedSortColumns = ['lastSeenAt'];

    let page = parseInt(searchParams.get('page') as string) || 1;
    let pageSize = parseInt(searchParams.get('pageSize') as string) || 10;
    let sortColumn = searchParams.get('sortColumn') as string;
    let sortDirection = searchParams.get('sortDirection') as 'asc' | 'desc';

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

    if (isNaN(skip) || isNaN(take)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const where = {
      teamId: selectedTeam,
      licenseId,
    } as Prisma.IpAddressWhereInput;

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
              id: selectedTeam,
            },
            include: {
              settings: true,
              ipAddresses: {
                where,
                orderBy: {
                  [sortColumn]: sortDirection,
                },
                skip,
                take,
              },
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (!session.user.teams.length) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const team = session.user.teams[0];

    const totalResults = await prisma.ipAddress.count({
      where,
    });

    const ipAddresses = team.ipAddresses;

    const formattedIpAddresses = ipAddresses.map((ip) => {
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

    return NextResponse.json({
      ipAddresses: formattedIpAddresses,
      totalResults,
    });
  } catch (error) {
    logger.error("Error occurred in 'licenses/ip-address' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
