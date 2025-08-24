import { createAuditLog } from '@/lib/logging/audit-log';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import {
  SetCustomerSchema,
  setCustomerSchema,
} from '@/lib/validation/customers/set-customer-schema';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  attemptWebhookDelivery,
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  createCustomerPayload,
  createWebhookEvents,
  logger,
  prisma,
  Prisma,
  regex,
  WebhookEventType,
} from '@lukittu/shared';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId } = params;

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

    const searchParams = request.nextUrl.searchParams;

    const MAX_PAGE_SIZE = 100;
    const DEFAULT_PAGE_SIZE = 25;
    const DEFAULT_PAGE = 1;
    const DEFAULT_SORT_DIRECTION = 'desc' as const;
    const DEFAULT_SORT_COLUMN = 'createdAt';

    const allowedPageSizes = [10, 25, 50, 100];
    const allowedSortDirections = ['asc', 'desc'] as const;
    const allowedSortColumns = [
      'fullName',
      'createdAt',
      'updatedAt',
      'email',
      'username',
    ] as const;

    const rawPage = parseInt(searchParams.get('page') as string);
    const rawPageSize = parseInt(searchParams.get('pageSize') as string);
    const rawSortColumn = searchParams.get('sortColumn');
    const rawSortDirection = searchParams.get(
      'sortDirection',
    ) as (typeof allowedSortDirections)[number];

    // Validate and sanitize input parameters
    const page = !isNaN(rawPage) && rawPage > 0 ? rawPage : DEFAULT_PAGE;

    const pageSize =
      !isNaN(rawPageSize) && allowedPageSizes.includes(rawPageSize)
        ? Math.min(rawPageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    const sortDirection = allowedSortDirections.includes(rawSortDirection)
      ? rawSortDirection
      : DEFAULT_SORT_DIRECTION;

    const sortColumn =
      rawSortColumn &&
      allowedSortColumns.includes(
        rawSortColumn as (typeof allowedSortColumns)[number],
      )
        ? rawSortColumn
        : DEFAULT_SORT_COLUMN;

    const search = searchParams.get('search') || '';
    const licenseId = searchParams.get('licenseId') as string;
    const licenseCountMin = searchParams.get('licenseCountMin');
    const licenseCountMax = searchParams.get('licenseCountMax');
    const licenseCountComparisonMode = searchParams.get(
      'licenseCountComparisonMode',
    );

    let metadata = searchParams.get('metadataKey') as string | undefined;
    let metadataValue = searchParams.get('metadataValue') as string | undefined;

    // Metadata validation
    if ((metadata && !metadataValue) || (!metadata && metadataValue)) {
      metadata = undefined;
      metadataValue = undefined;
    }

    if (metadata && metadataValue) {
      if (metadata.length < 1 || metadata.length > 255) {
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

    // License ID validation
    if (licenseId && !regex.uuidV4.test(licenseId)) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid licenseId format',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const skip = (page - 1) * pageSize;

    // License count filtering
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
          const baseQuery = Prisma.sql`
            SELECT c.id
            FROM "Customer" c
            LEFT JOIN "_CustomerToLicense" cl ON c.id = cl."A"
            LEFT JOIN "License" l ON cl."B" = l.id
            WHERE c."teamId" = ${teamId}
            GROUP BY c.id
          `;

          const filteredCustomerIds = await prisma.$queryRaw<{ id: string }[]>(
            Prisma.sql`${baseQuery} ${havingClause}`,
          );

          licenseCountFilter = {
            id: {
              in: filteredCustomerIds.map((c) => c.id),
            },
          };
        }
      }
    }

    const where = {
      ...licenseCountFilter,
      teamId,
      licenses: licenseId
        ? {
            some: {
              id: licenseId,
            },
          }
        : undefined,
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
            {
              username: {
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

    // Get total count and customers
    const [totalResults, customers] = await prisma.$transaction([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        skip,
        take: pageSize + 1,
        orderBy: {
          [sortColumn]: sortDirection,
        },
        include: {
          metadata: true,
          address: true,
        },
      }),
    ]);

    const hasNextPage = customers.length > pageSize;

    const formattedCustomers = customers.slice(0, pageSize);

    const response: IExternalDevResponse = {
      data: {
        hasNextPage,
        totalResults,
        customers: formattedCustomers,
      },
      result: {
        details: 'Customers found',
        timestamp: new Date(),
        valid: true,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      "Error in '(external)/v1/dev/teams/[teamId]/customers' route",
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

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId } = params;

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

    const body = (await request.json()) as SetCustomerSchema;
    const validated = await setCustomerSchema().safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: validated.error.errors[0].message,
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { email, fullName, metadata, address, username } = validated.data;

    const customerAmount = await prisma.customer.count({
      where: {
        teamId: team.id,
      },
    });

    if (customerAmount >= team.limits.maxCustomers) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Customer limit reached',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    let webhookEventIds: string[] = [];

    const response = await prisma.$transaction(async (prisma) => {
      const customer = await prisma.customer.create({
        data: {
          email,
          fullName,
          username,
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
          team: {
            connect: {
              id: team.id,
            },
          },
        },
        include: {
          metadata: true,
          address: true,
        },
      });

      const response: IExternalDevResponse = {
        data: customer,
        result: {
          details: 'Customer created',
          timestamp: new Date(),
          valid: true,
        },
      };

      await createAuditLog({
        teamId: team.id,
        action: AuditLogAction.CREATE_CUSTOMER,
        targetId: customer.id,
        targetType: AuditLogTargetType.CUSTOMER,
        requestBody: body,
        responseBody: response,
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.CUSTOMER_CREATED,
        teamId: team.id,
        payload: createCustomerPayload(customer),
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      return response;
    });

    void attemptWebhookDelivery(webhookEventIds);

    return NextResponse.json(response, { status: HttpStatus.CREATED });
  } catch (error) {
    logger.error(
      "Error in '(external)/v1/dev/teams/[teamId]/customers' route",
      error,
    );

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid JSON body',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.BAD_REQUEST,
        },
      );
    }

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
