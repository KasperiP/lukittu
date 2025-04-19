import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setCustomerSchema,
  SetCustomerSchema,
} from '@/lib/validation/customers/set-customer-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  Address,
  AuditLogAction,
  AuditLogTargetType,
  Customer,
  logger,
  Metadata,
  prisma,
  Prisma,
  regex,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type ICustomersGetSuccessResponse = {
  customers: (Customer & {
    address: Address | null;
    metadata: Metadata[];
  })[];
  totalResults: number;
  hasResults: boolean;
};

export type ICustomersGetResponse =
  | ErrorResponse
  | ICustomersGetSuccessResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ICustomersGetResponse>> {
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
    const allowedSortColumns = ['fullName', 'createdAt', 'updatedAt', 'email'];

    const search = (searchParams.get('search') as string) || '';

    const licenseId = searchParams.get('licenseId') as string;
    const licenseCountMin = searchParams.get('licenseCountMin');
    const licenseCountMax = searchParams.get('licenseCountMax');
    const licenseCountComparisonMode = searchParams.get(
      'licenseCountComparisonMode',
    );
    let page = parseInt(searchParams.get('page') as string) || 1;
    let pageSize = parseInt(searchParams.get('pageSize') as string) || 10;
    let sortColumn = searchParams.get('sortColumn') as string;
    let sortDirection = searchParams.get('sortDirection') as 'asc' | 'desc';
    let metadata = searchParams.get('metadataKey') as string | undefined;
    let metadataValue = searchParams.get('metadataValue') as string | undefined;

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

    if (licenseId && !regex.uuidV4.test(licenseId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
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
    let licenseCountFilter: Prisma.CustomerWhereInput | undefined;

    if (licenseCountMin) {
      const min = parseInt(licenseCountMin);
      if (!isNaN(min) && min >= 0) {
        let havingClause: Prisma.Sql | undefined;

        switch (licenseCountComparisonMode) {
          case 'between': {
            const max = parseInt(licenseCountMax || '');
            if (!isNaN(max)) {
              havingClause = Prisma.sql`HAVING COUNT(l.id) >= ${min} AND COUNT(l.id) <= ${max}`;
            }
            break;
          }
          case 'equals':
            havingClause = Prisma.sql`HAVING COUNT(l.id) = ${min}`;
            break;
          case 'greater':
            havingClause = Prisma.sql`HAVING COUNT(l.id) > ${min}`;
            break;
          case 'less':
            havingClause = Prisma.sql`HAVING COUNT(l.id) < ${min}`;
            break;
        }

        if (havingClause) {
          const filteredCustomerIds = await prisma.$queryRaw<{ id: string }[]>`
        SELECT c.id
        FROM "Customer" c
        LEFT JOIN "_CustomerToLicense" cl ON c.id = cl."A"
        LEFT JOIN "License" l ON cl."B" = l.id
        WHERE c."teamId" = ${selectedTeam}
        GROUP BY c.id
        ${havingClause}
        `;

          licenseCountFilter = {
            id: {
              in: filteredCustomerIds.map((c) => c.id),
            },
          };
        }
      }
    }

    const where = {
      teamId: selectedTeam,
      ...licenseCountFilter,
      licenses: licenseId
        ? {
            some: {
              id: licenseId,
            },
          }
        : {},
      OR: search
        ? [
            {
              email: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              fullName: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ]
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
    } as Prisma.CustomerWhereInput;

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
              id: selectedTeam,
            },
            include: {
              customers: {
                where,
                orderBy: {
                  [sortColumn]: sortDirection,
                },
                skip,
                take,
                include: {
                  address: true,
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
      prisma.customer.findFirst({
        where: {
          teamId: selectedTeam,
        },
        select: {
          id: true,
        },
      }),
      prisma.customer.count({
        where,
      }),
    ]);

    const customers = session.user.teams[0].customers;

    return NextResponse.json({
      customers,
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

type ICustomersCreateSuccessResponse = {
  customer: Customer;
};
export type ICustomersCreateResponse =
  | ErrorResponse
  | ICustomersCreateSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ICustomersCreateResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetCustomerSchema;
    const validated = await setCustomerSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          field: validated.error.errors[0].path[0],
          message: validated.error.errors[0].message,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { email, fullName, metadata, address } = validated.data;

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
              customers: true,
              limits: true,
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
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

    if (team.customers.length >= team.limits.maxCustomers) {
      return NextResponse.json(
        {
          message: t('validation.max_customers_reached'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const existingCustomer = team.customers.find(
      (customer) => customer.email === email,
    );
    if (existingCustomer) {
      return NextResponse.json(
        {
          message: t('validation.customer_exists'),
          field: 'email',
        },
        { status: HttpStatus.CONFLICT },
      );
    }

    const customer = await prisma.customer.create({
      data: {
        email,
        fullName,
        metadata: {
          createMany: {
            data: metadata.map((m) => ({
              ...m,
              teamId: team.id,
            })),
          },
        },
        address: {
          create: address,
        },
        createdBy: {
          connect: {
            id: session.user.id,
          },
        },
        team: {
          connect: {
            id: team.id,
          },
        },
      },
      include: {
        metadata: true,
      },
    });

    const response = {
      customer,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: team.id,
      action: AuditLogAction.CREATE_CUSTOMER,
      targetId: customer.id,
      targetType: AuditLogTargetType.CUSTOMER,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response, { status: HttpStatus.CREATED });
  } catch (error) {
    logger.error("Error occurred in 'customers' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
