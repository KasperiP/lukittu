import { regex } from '@/lib/constants/regex';
import prisma from '@/lib/database/prisma';
import { LicenseStatus } from '@/lib/licenses/license-status';
import { createAuditLog } from '@/lib/logging/audit-log';
import { logger } from '@/lib/logging/logger';
import {
  decryptLicenseKey,
  encryptLicenseKey,
  generateHMAC,
} from '@/lib/security/crypto';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  SetLicenseScheama,
  setLicenseSchema,
} from '@/lib/validation/licenses/set-license-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogTargetType,
  Customer,
  License,
  Metadata,
  Prisma,
  Product,
} from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type ILicensesGetSuccessResponse = {
  licenses: (Omit<License, 'licenseKeyLookup'> & {
    products: Product[];
    customers: Customer[];
    metadata: Metadata[];
  })[];
  totalResults: number;
  hasResults: boolean;
};

export type ILicensesGetResponse = ErrorResponse | ILicensesGetSuccessResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ILicensesGetResponse>> {
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

    const allowedPageSizes = [10, 25, 50, 100];
    const allowedSortDirections = ['asc', 'desc'];
    const allowedSortColumns = ['createdAt', 'updatedAt'];

    const search = (searchParams.get('search') as string) || '';

    let page = parseInt(searchParams.get('page') as string) || 1;
    let pageSize = parseInt(searchParams.get('pageSize') as string) || 10;
    let sortColumn = searchParams.get('sortColumn') as string;
    let sortDirection = searchParams.get('sortDirection') as 'asc' | 'desc';
    let metadata = searchParams.get('metadataKey') as string | undefined;
    let metadataValue = searchParams.get('metadataValue') as string | undefined;
    const productIds = (searchParams.get('productIds') as string) || '';
    const customerIds = (searchParams.get('customerIds') as string) || '';

    const productIdsFormatted: string[] = [];
    const customerIdsFormatted: string[] = [];

    if ((metadata && !metadataValue) || (!metadata && metadataValue)) {
      metadata = undefined;
      metadataValue = undefined;
    }

    if (metadata && metadataValue) {
      if (metadata && (metadata.length < 1 || metadata.length > 255)) {
        metadata = undefined;
        metadataValue = undefined;
      }

      if (
        metadataValue &&
        (metadataValue.length < 1 || metadataValue.length > 255)
      ) {
        metadata = undefined;
        metadataValue = undefined;
      }
    }

    const hasValidMetadata = Boolean(metadata && metadataValue);

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

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const isFullLicense = search.match(regex.licenseKey);

    const licenseKeyLookup = isFullLicense
      ? generateHMAC(`${search}:${selectedTeam}`)
      : undefined;

    const ipCountMin = searchParams.get('ipCountMin');
    const ipCountMax = searchParams.get('ipCountMax');
    const ipCountComparisonMode = searchParams.get('ipCountComparisonMode');

    let ipCountFilter: Prisma.LicenseWhereInput | undefined;

    if (ipCountMin) {
      const teamLimits = await prisma.limits.findUnique({
        where: {
          teamId: selectedTeam,
        },
      });

      if (!teamLimits) {
        return NextResponse.json(
          {
            message: t('validation.team_not_found'),
          },
          { status: HttpStatus.NOT_FOUND },
        );
      }

      const logRetentionDays = teamLimits.logRetention;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - logRetentionDays);

      const min = parseInt(ipCountMin);
      if (!isNaN(min) && min >= 0) {
        const uniqueIpCounts = await prisma.$queryRaw<
          { id: string; ipCount: number }[]
        >`
        SELECT l.id, COUNT(DISTINCT rl."ipAddress") as "ipCount" 
        FROM "License" l
        LEFT JOIN "RequestLog" rl ON l.id = rl."licenseId"
        WHERE l."teamId" = ${Prisma.sql`${selectedTeam}`}
        AND rl."ipAddress" IS NOT NULL
        AND rl."createdAt" >= ${Prisma.sql`${startDate}`}
        GROUP BY l.id
      `;

        const filteredLicenseIds = uniqueIpCounts
          .filter((license) => {
            const ipCount = Number(license.ipCount);
            switch (ipCountComparisonMode) {
              case 'between':
                const max = parseInt(ipCountMax || '');
                return !isNaN(max) && ipCount >= min && ipCount <= max;
              case 'equals':
                return ipCount === min;
              case 'greater':
                return ipCount > min;
              case 'less':
                return ipCount < min;
              default:
                return false;
            }
          })
          .map((license) => license.id);

        ipCountFilter = {
          id: {
            in: filteredLicenseIds,
          },
        };
      }
    }

    const status = searchParams.get('status') as LicenseStatus | null;
    const currentDate = new Date();
    const thirtyDaysAgo = new Date(
      currentDate.getTime() - 30 * 24 * 60 * 60 * 1000,
    );

    let statusFilter: Prisma.LicenseWhereInput = {};

    if (status) {
      switch (status) {
        case 'ACTIVE':
          statusFilter = {
            suspended: false,
            lastActiveAt: {
              gt: thirtyDaysAgo,
            },
            OR: [
              { expirationType: 'NEVER' },
              {
                AND: [
                  {
                    expirationType: {
                      in: ['DATE', 'DURATION'],
                    },
                  },

                  // Not expired
                  {
                    expirationDate: {
                      gt: currentDate,
                    },
                  },

                  // Not expiring (more than 30 days left)
                  {
                    expirationDate: {
                      gt: new Date(
                        currentDate.getTime() + 30 * 24 * 60 * 60 * 1000,
                      ),
                    },
                  },
                ],
              },
            ],
          };
          break;
        case 'INACTIVE':
          statusFilter = {
            suspended: false,
            lastActiveAt: {
              lte: thirtyDaysAgo,
            },
            OR: [
              { expirationType: 'NEVER' },
              {
                AND: [
                  { expirationType: { in: ['DATE', 'DURATION'] } },

                  // Must not be expired
                  {
                    expirationDate: {
                      gt: new Date(currentDate.getTime()),
                    },
                  },

                  // Must not be expiring
                  {
                    expirationDate: {
                      gt: new Date(
                        currentDate.getTime() + 30 * 24 * 60 * 60 * 1000,
                      ),
                    },
                  },
                ],
              },
            ],
          };
          break;
        case 'EXPIRING':
          statusFilter = {
            suspended: false,
            expirationType: {
              in: ['DATE', 'DURATION'],
            },
            expirationDate: {
              gt: currentDate,
              lt: new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000),
            },
          };
          break;
        case 'EXPIRED':
          statusFilter = {
            suspended: false,
            expirationType: {
              in: ['DATE', 'DURATION'],
            },
            expirationDate: {
              lt: currentDate,
            },
          };
          break;
        case 'SUSPENDED':
          statusFilter = {
            suspended: true,
          };
          break;
      }
    }

    const where = {
      ...ipCountFilter,
      ...statusFilter,
      teamId: selectedTeam,
      licenseKeyLookup,
      products: productIdsFormatted.length
        ? {
            some: {
              id: {
                in: productIdsFormatted,
              },
            },
          }
        : undefined,
      customers: customerIdsFormatted.length
        ? {
            some: {
              id: {
                in: customerIdsFormatted,
              },
            },
          }
        : undefined,
      metadata: hasValidMetadata
        ? {
            some: {
              key: metadata,
              value: {
                contains: metadataValue,
                mode: 'insensitive',
              },
            },
          }
        : undefined,
    } as Prisma.LicenseWhereInput;

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
              id: selectedTeam,
            },
            include: {
              licenses: {
                where,
                skip,
                take,
                orderBy: {
                  [sortColumn]: sortDirection,
                },
                include: {
                  products: true,
                  customers: true,
                  metadata: true,
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

    const [hasResults, totalResults] = await prisma.$transaction([
      prisma.license.findFirst({
        where: {
          teamId: selectedTeam,
        },
        select: {
          id: true,
        },
      }),
      prisma.license.count({
        where,
      }),
    ]);

    const licenses = session.user.teams[0].licenses.map((license) => ({
      ...license,
      licenseKey: decryptLicenseKey(license.licenseKey),
      licenseKeyLookup: undefined,
    }));

    return NextResponse.json({
      licenses,
      totalResults,
      hasResults: Boolean(hasResults),
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

export type ILicensesCreateResponse =
  | ErrorResponse
  | ILicensesCreateSuccessResponse;

export type ILicensesCreateSuccessResponse = {
  license: Omit<License, 'licenseKeyLookup'>;
};
export async function POST(
  request: NextRequest,
): Promise<NextResponse<ILicensesCreateResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetLicenseScheama;
    const validated = await setLicenseSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          field: validated.error.errors[0].path[0],
          message: validated.error.errors[0].message,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const {
      customerIds,
      expirationDate,
      expirationDays,
      expirationStart,
      expirationType,
      ipLimit,
      licenseKey,
      metadata,
      productIds,
      seats,
      suspended,
    } = body;

    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
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
                omit: {
                  licenseKeyLookup: false,
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

    if (!team.limits) {
      // Should never happen
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (team.licenses.length >= team.limits.maxLicenses) {
      return NextResponse.json(
        {
          message: t('validation.max_licenses_reached'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const hmac = generateHMAC(`${licenseKey}:${team.id}`);

    const licenseExists = team.licenses.find(
      (license) => license.licenseKeyLookup === hmac,
    );

    if (licenseExists) {
      return NextResponse.json(
        {
          message: t('validation.license_key_exists'),
          field: 'licenseKey',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const productsPromise = prisma.product.findMany({
      where: {
        teamId: team.id,
        id: {
          in: productIds,
        },
      },
    });

    const customersPromise = prisma.customer.findMany({
      where: {
        teamId: team.id,
        id: {
          in: customerIds,
        },
      },
    });

    const [products, customers] = await Promise.all([
      productsPromise,
      customersPromise,
    ]);

    if (products.length !== productIds.length) {
      return NextResponse.json(
        {
          message: t('validation.product_not_found'),
          field: 'productIds',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (customers.length !== customerIds.length) {
      return NextResponse.json(
        {
          message: t('validation.customer_not_found'),
          field: 'customerIds',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const encryptedLicenseKey = encryptLicenseKey(licenseKey);

    const license = await prisma.license.create({
      data: {
        expirationDate,
        expirationDays,
        expirationStart: expirationStart || 'CREATION',
        expirationType,
        ipLimit,
        licenseKey: encryptedLicenseKey,
        licenseKeyLookup: hmac,
        metadata: {
          createMany: {
            data: metadata.map((m) => ({
              ...m,
              teamId: team.id,
            })),
          },
        },
        suspended,
        teamId: team.id,
        seats,
        products: productIds.length
          ? { connect: productIds.map((id) => ({ id })) }
          : undefined,
        customers: customerIds.length
          ? { connect: customerIds.map((id) => ({ id })) }
          : undefined,
        createdByUserId: session.user.id,
      },
    });

    const response = {
      license: {
        ...license,
        licenseKey,
        licenseKeyLookup: undefined,
      },
    };

    createAuditLog({
      userId: session.user.id,
      teamId: team.id,
      action: AuditLogAction.CREATE_LICENSE,
      targetId: license.id,
      targetType: AuditLogTargetType.LICENSE,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'licenses' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
