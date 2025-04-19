import { getSession } from '@/lib/security/session';
import { iso2toIso3, iso3toIso2 } from '@/lib/utils/country-helpers';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { Device, logger, prisma, Prisma, regex } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type DeviceStatus = 'active' | 'inactive';

export type ILicenseDevicesGetSuccessResponse = {
  devices: (Device & {
    status: DeviceStatus;
    country: string | null;
    alpha2: string | null;
  })[];
  totalResults: number;
};

export type ILicenseDevicesGetResponse =
  | ErrorResponse
  | ILicenseDevicesGetSuccessResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ILicenseDevicesGetResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const searchParams = request.nextUrl.searchParams;
    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const licenseId = searchParams.get('licenseId') as string;
    const allowedPageSizes = [10, 25, 50, 100];
    const allowedSortDirections = ['asc', 'desc'];
    const allowedSortColumns = ['lastBeatAt'];

    let page = parseInt(searchParams.get('page') as string) || 1;
    let pageSize = parseInt(searchParams.get('pageSize') as string) || 10;
    let sortColumn = searchParams.get('sortColumn') as string;
    let sortDirection = searchParams.get('sortDirection') as 'asc' | 'desc';

    if (licenseId && !regex.uuidV4.test(licenseId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const limits = await prisma.limits.findUnique({
      where: {
        teamId: selectedTeam,
      },
    });

    if (!limits) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (!allowedSortDirections.includes(sortDirection)) {
      sortDirection = 'desc';
    }

    if (!sortColumn || !allowedSortColumns.includes(sortColumn)) {
      sortColumn = 'lastBeatAt';
    }

    if (!allowedPageSizes.includes(pageSize)) {
      pageSize = 25;
    }

    if (page < 1) {
      page = 1;
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const logRetentionDays = limits.logRetention;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - logRetentionDays);

    const where = {
      teamId: selectedTeam,
      licenseId,
      lastBeatAt: {
        gte: startDate,
      },
    } as Prisma.DeviceWhereInput;

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
              devices: {
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

    const totalResults = await prisma.device.count({
      where,
    });

    const devices = team.devices;

    const devicesWithStatus = devices.map((device) => {
      const deviceTimeout = team.settings?.deviceTimeout || 60;

      const lastBeatAt = new Date(device.lastBeatAt);
      const now = new Date();

      const diff = Math.abs(now.getTime() - lastBeatAt.getTime());
      const minutes = Math.floor(diff / 1000 / 60);

      const status: DeviceStatus =
        minutes <= deviceTimeout ? 'active' : 'inactive';

      return {
        ...device,
        country: iso2toIso3(device.country),
        alpha2: iso3toIso2(device.country),
        status,
      };
    });

    return NextResponse.json({
      devices: devicesWithStatus,
      totalResults,
    });
  } catch (error) {
    logger.error("Error occurred in 'products' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
