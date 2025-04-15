import { regex } from '@/lib/constants/regex';
import prisma from '@/lib/database/prisma';
import { logger } from '@/lib/logging/logger';
import { getSession } from '@/lib/security/session';
import { iso3toIso2, iso3ToName } from '@/lib/utils/country-helpers';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { Prisma } from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type ILicenseIpAddressGetSuccessResponse = {
  ipAddresses: {
    ipAddress: string;
    lastSeen: Date;
    requestCount: number;
    country: string | null;
    alpha2: string | null;
    alpha3: string | null;
  }[];
  totalResults: number;
  hasResults: boolean;
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

    let page = parseInt(searchParams.get('page') as string) || 1;
    let pageSize = parseInt(searchParams.get('pageSize') as string) || 10;
    let sortDirection = searchParams.get('sortDirection') as 'asc' | 'desc';

    if (!allowedSortDirections.includes(sortDirection)) {
      sortDirection = 'desc';
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

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
              id: selectedTeam,
            },
            include: {
              limits: true,
              licenses: {
                where: {
                  id: licenseId,
                },
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

    if (!team.licenses.length) {
      return NextResponse.json(
        {
          message: t('validation.license_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (!team.limits) {
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }

    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - team.limits.logRetention);

    const license = team.licenses[0];

    const [ipAddresses, totalResults, hasResults] = await prisma.$transaction([
      prisma.$queryRaw<
        {
          ipAddress: string;
          lastSeen: Date;
          requestCount: number;
          country: string | null;
        }[]
      >`
        SELECT 
          "ipAddress",
          MAX("createdAt") as "lastSeen",
          CAST(COUNT(*) AS INTEGER) as "requestCount",
          MAX("country") as "country"
        FROM "RequestLog"
        WHERE "licenseId" = ${license.id}
        AND "createdAt" >= ${retentionDate}
        GROUP BY "ipAddress"
        ORDER BY "lastSeen" ${
          sortDirection === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`
        }
        LIMIT ${take} OFFSET ${skip}
      `,
      prisma.$queryRaw<[{ count: number }]>`
        SELECT CAST(COUNT(DISTINCT "ipAddress") AS INTEGER) as count
        FROM "RequestLog"
        WHERE "licenseId" = ${license.id}
        AND "createdAt" >= ${retentionDate}
      `,
      prisma.requestLog.findFirst({
        where: {
          licenseId,
          createdAt: {
            gte: retentionDate,
          },
        },
        select: {
          id: true,
        },
      }),
    ]);

    return NextResponse.json({
      ipAddresses: ipAddresses.map((ip) => ({
        ...ip,
        country: iso3ToName(ip.country),
        alpha2: ip.country ? iso3toIso2(ip.country) : null,
        alpha3: ip.country ?? null,
      })),
      totalResults: Number(totalResults[0].count),
      hasResults: Boolean(hasResults),
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
