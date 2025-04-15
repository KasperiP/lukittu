import { regex } from '@/lib/constants/regex';
import prisma from '@/lib/database/prisma';
import { logger } from '@/lib/logging/logger';
import { generateHMAC } from '@/lib/security/crypto';
import { getSession } from '@/lib/security/session';
import { iso3toIso2, iso3ToName } from '@/lib/utils/country-helpers';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { Prisma, RequestLog } from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';
import { UAParser } from 'ua-parser-js';
import { z } from 'zod';

export type ILogsGetSuccessResponse = {
  logs: (RequestLog & {
    alpha2: string | null;
    alpha3: string | null;
    country: string | null;
    browser: string | null;
    os: string | null;
  })[];
  totalResults: number;
  hasResults: boolean;
};

export type ILogsGetResponse = ErrorResponse | ILogsGetSuccessResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ILogsGetResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const searchParams = request.nextUrl.searchParams;
    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        { message: t('validation.team_not_found') },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const allowedPageSizes = [10, 25, 50, 100];
    const allowedSortDirections = ['asc', 'desc'];
    const allowedSortColumns = ['createdAt'];
    const allowedStatus = ['success', 'error', 'warning'];
    const allowedTypes = ['VERIFY', 'DOWNLOAD', 'HEARTBEAT'];

    const licenseSearch = (searchParams.get('licenseSearch') as string) || '';
    const ipSearch = (searchParams.get('ipSearch') as string) || '';
    const licenseId = searchParams.get('licenseId') as string;
    const productIds = (searchParams.get('productIds') as string) || '';
    const customerIds = (searchParams.get('customerIds') as string) || '';
    const rangeStart = searchParams.get('rangeStart') as string;
    const rangeEnd = searchParams.get('rangeEnd') as string;
    const status = searchParams.get('status') as string;
    const type = searchParams.get('type') as string;

    let page = parseInt(searchParams.get('page') as string) || 1;
    let pageSize = parseInt(searchParams.get('pageSize') as string) || 10;
    let sortColumn = searchParams.get('sortColumn') as string;
    let sortDirection = searchParams.get('sortDirection') as 'asc' | 'desc';

    const productIdsFormatted: string[] = [];
    const customerIdsFormatted: string[] = [];

    const invalidRangeStart = z.coerce
      .date()
      .safeParse(new Date(rangeStart)).error;
    const invalidRangeEnd = z.coerce.date().safeParse(new Date(rangeEnd)).error;
    const invalidIpAddress = z.string().ip().safeParse(ipSearch).error;

    if (type && !allowedTypes.includes(type)) {
      return NextResponse.json(
        { message: t('validation.bad_request') },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (status && !allowedStatus.includes(status)) {
      return NextResponse.json(
        { message: t('validation.bad_request') },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if ((rangeStart && invalidRangeStart) || (rangeEnd && invalidRangeEnd)) {
      return NextResponse.json(
        { message: t('validation.bad_request') },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (licenseId && !regex.uuidV4.test(licenseId)) {
      return NextResponse.json(
        { message: t('validation.bad_request') },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (productIds) {
      const productIdArray = productIds.split(',');
      for (const id of productIdArray) {
        if (regex.uuidV4.test(id)) {
          productIdsFormatted.push(id);
        }
      }
    }

    if (customerIds) {
      const customerIdArray = customerIds.split(',');
      for (const id of customerIdArray) {
        if (regex.uuidV4.test(id)) {
          customerIdsFormatted.push(id);
        }
      }
    }

    if (!allowedSortDirections.includes(sortDirection)) {
      sortDirection = 'desc';
    }

    if (!sortColumn || !allowedSortColumns.includes(sortColumn)) {
      sortColumn = 'createdAt';
    }

    if (!allowedPageSizes.includes(pageSize)) {
      pageSize = 25;
    }

    if (page < 1) {
      page = 1;
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const hasResults = await prisma.requestLog.findFirst({
      where: {
        teamId: selectedTeam,
      },
    });

    const team = await prisma.team.findUnique({
      where: { id: selectedTeam, deletedAt: null },
      include: { limits: true },
    });

    if (ipSearch && invalidIpAddress) {
      return NextResponse.json({
        logs: [],
        totalResults: 0,
        hasResults: Boolean(hasResults),
      });
    }

    if (licenseSearch && !regex.licenseKey.test(licenseSearch)) {
      return NextResponse.json({
        logs: [],
        totalResults: 0,
        hasResults: Boolean(hasResults),
      });
    }

    if (!team) {
      return NextResponse.json(
        { message: t('validation.team_not_found') },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const DAYS_IN_MONTH = 30;
    const SIX_MONTHS_IN_DAYS = 6 * DAYS_IN_MONTH;
    const teamLogRetentionDays =
      team.limits?.logRetention ?? SIX_MONTHS_IN_DAYS;
    const teamLogRetentionInMonths = Math.floor(
      teamLogRetentionDays / DAYS_IN_MONTH,
    );

    const licenseKeyLookup = licenseSearch
      ? generateHMAC(`${licenseSearch}:${selectedTeam}`)
      : undefined;

    const furthestAllowedDate = new Date();
    furthestAllowedDate.setMonth(
      furthestAllowedDate.getMonth() - teamLogRetentionInMonths,
    );

    let rangeStartToUse = furthestAllowedDate;
    if (rangeStart && new Date(rangeStart) > furthestAllowedDate) {
      rangeStartToUse = new Date(rangeStart);
    }

    let statusFilter: Prisma.RequestLogWhereInput['statusCode'];
    if (status === 'success') {
      statusFilter = {
        gte: 200,
        lte: 299,
      };
    }

    if (status === 'warning') {
      statusFilter = {
        gte: 300,
        lte: 499,
      };
    }

    if (status === 'error') {
      statusFilter = {
        gte: 500,
        lte: 599,
      };
    }

    const where = {
      teamId: selectedTeam,
      statusCode: statusFilter ? statusFilter : undefined,
      createdAt: {
        gte: rangeStartToUse,
        lte: rangeEnd ? new Date(rangeEnd) : new Date(),
      },
      licenseId: licenseId ? licenseId : undefined,
      productId: productIdsFormatted.length
        ? { in: productIdsFormatted }
        : undefined,
      customerId: customerIdsFormatted.length
        ? { in: customerIdsFormatted }
        : undefined,
      license: licenseKeyLookup ? { licenseKeyLookup } : undefined,
      ipAddress: ipSearch ? { contains: ipSearch } : undefined,
      type: type ? type : undefined,
    } as Prisma.RequestLogWhereInput;

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
              id: selectedTeam,
            },
            include: {
              requestLogs: {
                where,
                orderBy: [
                  {
                    [sortColumn]: sortDirection,
                  },
                ],
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

    const totalResults = await prisma.requestLog.count({
      where,
    });

    const requestLogs = session.user.teams[0].requestLogs;

    const requestLogsWithCountries = requestLogs.map((log) => {
      let browser: string | null = null;
      let os: string | null = null;

      if (log.userAgent) {
        const parser = new UAParser(log.userAgent);
        const browserObj = parser.getBrowser();
        const osObj = parser.getOS();

        browser = browserObj.name ?? null;
        os = osObj.name ?? null;
      }

      return {
        ...log,
        country: iso3ToName(log.country),
        alpha3: log.country ?? null,
        alpha2: iso3toIso2(log.country),
        browser,
        os,
      };
    });

    return NextResponse.json({
      logs: requestLogsWithCountries,
      totalResults,
      hasResults: Boolean(hasResults),
    });
  } catch (error) {
    logger.error("Error occurred in 'logs' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
