import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  SetLicenseScheama,
  setLicenseSchema,
} from '@/lib/validation/licenses/set-license-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  attemptWebhookDelivery,
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  calculateLicenseExpirationDate,
  createLicensePayload,
  createWebhookEvents,
  Customer,
  CustomerDiscordAccount,
  decryptString,
  encryptString,
  generateHMAC,
  getLicenseStatusFilter,
  License,
  LicenseExpirationStart,
  LicenseExpirationType,
  LicenseStatus,
  logger,
  Metadata,
  prisma,
  Prisma,
  Product,
  publishDiscordSync,
  regex,
  WebhookEventType,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { after, NextRequest, NextResponse } from 'next/server';

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
    const licenseKey = (searchParams.get('licenseKey') as string) || '';

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

    const isFullLicenseFromKey = licenseKey.match(regex.licenseKey);

    const licenseKeyLookup = isFullLicenseFromKey
      ? generateHMAC(`${licenseKey}:${selectedTeam}`)
      : undefined;

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
    const teamSettings = team.settings;

    if (!teamSettings) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const ipCountMin = searchParams.get('ipCountMin');
    const ipCountMax = searchParams.get('ipCountMax');
    const ipCountComparisonMode = searchParams.get('ipCountComparisonMode');

    const hwidCountMin = searchParams.get('hwidCountMin');
    const hwidCountMax = searchParams.get('hwidCountMax');
    const hwidCountComparisonMode = searchParams.get('hwidCountComparisonMode');

    const ipAddressFilter = searchParams.get('ipAddress');
    const hwidFilter = searchParams.get('hwid');

    let ipCountFilter: Prisma.LicenseWhereInput | undefined;
    let hwidCountFilter: Prisma.LicenseWhereInput | undefined;
    let specificIpFilter: Prisma.LicenseWhereInput | undefined;
    let specificHwidFilter: Prisma.LicenseWhereInput | undefined;

    if (ipCountMin) {
      const ipTimeout = teamSettings.ipTimeout || null;

      const min = parseInt(ipCountMin);
      if (!isNaN(min) && min >= 0) {
        const uniqueIpCounts = await prisma.$queryRaw<
          { id: string; ipCount: number }[]
        >`
          SELECT l.id, COUNT(DISTINCT CASE 
            WHEN ip."ip" IS NOT NULL 
              AND ip."forgotten" = false
              AND (
                ${ipTimeout}::INTEGER IS NULL OR
                EXTRACT(EPOCH FROM (NOW() - ip."lastSeenAt")) / 60 <= ${ipTimeout}::INTEGER
              )
            THEN ip."ip" 
            ELSE NULL 
          END) as "ipCount"
          FROM "License" l
          LEFT JOIN "IpAddress" ip ON l.id = ip."licenseId"
          WHERE l."teamId" = ${selectedTeam}
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

    if (hwidCountMin) {
      const hwidTimeout = teamSettings.hwidTimeout || null;

      const min = parseInt(hwidCountMin);
      if (!isNaN(min) && min >= 0) {
        const uniqueHwidCounts = await prisma.$queryRaw<
          { id: string; hwidCount: number }[]
        >`
          SELECT l.id, COUNT(DISTINCT CASE 
            WHEN hwid."hwid" IS NOT NULL 
              AND hwid."forgotten" = false
              AND (
                ${hwidTimeout}::INTEGER IS NULL OR
                EXTRACT(EPOCH FROM (NOW() - hwid."lastSeenAt")) / 60 <= ${hwidTimeout}::INTEGER
              )
            THEN hwid."hwid" 
            ELSE NULL 
          END) as "hwidCount"
          FROM "License" l
          LEFT JOIN "HardwareIdentifier" hwid ON l.id = hwid."licenseId"
          WHERE l."teamId" = ${selectedTeam}
          GROUP BY l.id
        `;

        const filteredLicenseIds = uniqueHwidCounts
          .filter((license) => {
            const hwidCount = Number(license.hwidCount);
            switch (hwidCountComparisonMode) {
              case 'between':
                const max = parseInt(hwidCountMax || '');
                return !isNaN(max) && hwidCount >= min && hwidCount <= max;
              case 'equals':
                return hwidCount === min;
              case 'greater':
                return hwidCount > min;
              case 'less':
                return hwidCount < min;
              default:
                return false;
            }
          })
          .map((license) => license.id);

        hwidCountFilter = {
          id: {
            in: filteredLicenseIds,
          },
        };
      }
    }

    if (ipAddressFilter && ipAddressFilter.trim()) {
      specificIpFilter = {
        ipAddresses: {
          some: {
            ip: {
              contains: ipAddressFilter.trim(),
              mode: 'insensitive',
            },
            forgotten: false,
          },
        },
      };
    }

    if (hwidFilter && hwidFilter.trim()) {
      specificHwidFilter = {
        hardwareIdentifiers: {
          some: {
            hwid: {
              contains: hwidFilter.trim(),
              mode: 'insensitive',
            },
            forgotten: false,
          },
        },
      };
    }

    const status = searchParams.get('status') as LicenseStatus | null;

    const where = {
      ...ipCountFilter,
      ...hwidCountFilter,
      ...specificIpFilter,
      ...specificHwidFilter,
      ...getLicenseStatusFilter(status),
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
      teamId: selectedTeam,
    } as Prisma.LicenseWhereInput;

    const [licenses, hasResults, totalResults] = await Promise.all([
      prisma.license.findMany({
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
      }),
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

    const licensesFormatted = licenses.map((license) => ({
      ...license,
      licenseKey: decryptString(license.licenseKey),
      licenseKeyLookup: undefined,
    }));

    return NextResponse.json({
      licenses: licensesFormatted,
      totalResults,
      hasResults: Boolean(hasResults),
    });
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

export type ILicensesCreateResponse =
  | ErrorResponse
  | ILicensesCreateSuccessResponse;

export type ILicensesCreateSuccessResponse = {
  license: Omit<License, 'licenseKeyLookup'> & {
    products: Product[];
    customers: (Customer & {
      discordAccount: CustomerDiscordAccount | null;
    })[];
    metadata: Metadata[];
  };
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
      hwidLimit,
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

    const encryptedLicenseKey = encryptString(licenseKey);
    let webhookEventIds: string[] = [];

    const expirationStartFormatted =
      expirationStart?.toUpperCase() === LicenseExpirationStart.ACTIVATION
        ? LicenseExpirationStart.ACTIVATION
        : LicenseExpirationStart.CREATION;

    const expirationDateFormatted = calculateLicenseExpirationDate({
      expirationStart: expirationStartFormatted,
      expirationType: expirationType as LicenseExpirationType,
      expirationDays,
      expirationDate,
    });

    const response = await prisma.$transaction(async (prisma) => {
      const license = await prisma.license.create({
        data: {
          expirationDate: expirationDateFormatted,
          expirationStart: expirationStartFormatted,
          expirationDays,
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
          hwidLimit,
          products: productIds.length
            ? { connect: productIds.map((id) => ({ id })) }
            : undefined,
          customers: customerIds.length
            ? { connect: customerIds.map((id) => ({ id })) }
            : undefined,
          createdByUserId: session.user.id,
        },
        include: {
          products: true,
          customers: {
            include: { discordAccount: true },
          },
          metadata: true,
        },
      });

      const response = {
        license: {
          ...license,
          licenseKey,
          licenseKeyLookup: undefined,
        },
      };

      await createAuditLog({
        userId: session.user.id,
        teamId: team.id,
        action: AuditLogAction.CREATE_LICENSE,
        targetId: license.id,
        targetType: AuditLogTargetType.LICENSE,
        requestBody: body,
        responseBody: response,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.LICENSE_CREATED,
        teamId: team.id,
        payload: createLicensePayload(license),
        userId: session.user.id,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      return response;
    });

    after(async () => {
      await attemptWebhookDelivery(webhookEventIds);

      const promises = response.license.customers.map(async (customer) => {
        if (!customer.discordAccount) return;

        await publishDiscordSync({
          discordId: customer.discordAccount.discordId,
          teamId: team.id,
        });
      });

      await Promise.all(promises);
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
