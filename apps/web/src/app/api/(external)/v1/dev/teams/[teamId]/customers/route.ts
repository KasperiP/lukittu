import { createAuditLog } from '@/lib/logging/audit-log';
import { DiscordUser, fetchDiscordUserById } from '@/lib/providers/discord';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { getIp } from '@/lib/utils/header-helpers';
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
import crypto from 'crypto';
import { headers } from 'next/headers';
import { after, NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const { teamId } = params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();

  try {
    logger.info('Dev API: Get customers request started', {
      requestId,
      teamId,
      route: '/v1/dev/teams/[teamId]/customers',
      method: 'GET',
      userAgent,
      timestamp: requestTime.toISOString(),
      ipAddress,
    });

    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Invalid teamId provided for customer listing', {
        requestId,
        providedTeamId: teamId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

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
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: API key authentication failed for customer listing',
        {
          requestId,
          teamId,
          responseTimeMs: responseTime,
          statusCode: HttpStatus.UNAUTHORIZED,
          ipAddress,
          userAgent,
        },
      );

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
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid licenseId format provided for customer filtering',
        {
          requestId,
          teamId,
          providedLicenseId: licenseId,
          responseTimeMs: responseTime,
          statusCode: HttpStatus.BAD_REQUEST,
          ipAddress,
          userAgent,
        },
      );

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
            {
              discordAccount: {
                OR: [
                  {
                    discordId: {
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
                  {
                    globalName: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                ],
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
      teamId,
    } as Prisma.CustomerWhereInput;

    // Get total count and customers
    const [totalResults, customers] = await Promise.all([
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
          discordAccount: true,
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

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Customers retrieved successfully', {
      requestId,
      teamId,
      totalResults,
      returnedCount: formattedCustomers.length,
      hasNextPage,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(response);
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Get customers failed', {
      requestId,
      teamId,
      route: '/v1/dev/teams/[teamId]/customers',
      error: error instanceof Error ? error.message : String(error),
      errorType: error?.constructor?.name || 'Unknown',
      responseTimeMs: responseTime,
      ipAddress,
      userAgent,
    });
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
  const { teamId } = params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();

  try {
    logger.info('Dev API: Create customer request started', {
      requestId,
      teamId,
      route: '/v1/dev/teams/[teamId]/customers',
      method: 'POST',
      userAgent,
      timestamp: requestTime.toISOString(),
      ipAddress,
    });

    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Invalid teamId provided for customer creation', {
        requestId,
        providedTeamId: teamId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

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
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: API key authentication failed for customer creation',
        {
          requestId,
          teamId,
          responseTimeMs: responseTime,
          statusCode: HttpStatus.UNAUTHORIZED,
          ipAddress,
          userAgent,
        },
      );

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
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Customer creation validation failed', {
        requestId,
        teamId,
        validationErrors: validated.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

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

    const { email, fullName, metadata, address, username, discordId } =
      validated.data;

    const customerAmount = await prisma.customer.count({
      where: {
        teamId: team.id,
      },
    });

    if (customerAmount >= team.limits.maxCustomers) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Customer limit exceeded', {
        requestId,
        teamId,
        currentCount: customerAmount,
        maxAllowed: team.limits.maxCustomers,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

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

    let discordUser: DiscordUser | null = null;
    if (discordId) {
      // Check if Discord account is already linked to another customer in this team
      const existingDiscordAccount =
        await prisma.customerDiscordAccount.findUnique({
          where: {
            teamId_discordId: {
              teamId: team.id,
              discordId,
            },
          },
          include: {
            customer: true,
          },
        });

      if (existingDiscordAccount) {
        const responseTime = Date.now() - requestTime.getTime();

        logger.warn(
          'Dev API: Discord account already linked to another customer',
          {
            requestId,
            teamId,
            discordId,
            existingCustomerId: existingDiscordAccount.customer.id,
            responseTimeMs: responseTime,
            statusCode: HttpStatus.BAD_REQUEST,
            ipAddress,
            userAgent,
          },
        );

        return NextResponse.json(
          {
            data: null,
            result: {
              details: `Discord account is already linked to customer: ${existingDiscordAccount.customer.fullName || existingDiscordAccount.customer.username || existingDiscordAccount.customer.email || 'Unknown Customer'}`,
              timestamp: new Date(),
              valid: false,
            },
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }

      try {
        logger.info('Dev API: Validating Discord user', {
          requestId,
          teamId,
          discordId,
        });

        discordUser = await fetchDiscordUserById(discordId);

        if (!discordUser) {
          const responseTime = Date.now() - requestTime.getTime();

          logger.warn('Dev API: Discord user not found', {
            requestId,
            teamId,
            discordId,
            responseTimeMs: responseTime,
            statusCode: HttpStatus.BAD_REQUEST,
            ipAddress,
            userAgent,
          });

          return NextResponse.json(
            {
              data: null,
              result: {
                details: 'Discord user not found',
                timestamp: new Date(),
                valid: false,
              },
            },
            { status: HttpStatus.BAD_REQUEST },
          );
        }

        logger.info('Dev API: Discord user validated successfully', {
          requestId,
          teamId,
          discordId,
          discordUsername: discordUser.username,
        });
      } catch (error) {
        const responseTime = Date.now() - requestTime.getTime();

        logger.warn('Dev API: Discord validation failed', {
          requestId,
          teamId,
          discordId,
          error: error instanceof Error ? error.message : String(error),
          responseTimeMs: responseTime,
          statusCode: HttpStatus.BAD_REQUEST,
          ipAddress,
          userAgent,
        });

        return NextResponse.json(
          {
            data: null,
            result: {
              details: 'Discord validation failed',
              timestamp: new Date(),
              valid: false,
            },
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }
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
          address: address
            ? {
                create: address,
              }
            : undefined,
          discordAccount:
            discordUser && discordId
              ? {
                  create: {
                    discordId: discordUser.id,
                    username: discordUser.username,
                    avatar: discordUser.avatar,
                    globalName: discordUser.global_name,
                    teamId: team.id,
                  },
                }
              : undefined,
          team: {
            connect: {
              id: team.id,
            },
          },
        },
        include: {
          metadata: true,
          address: true,
          discordAccount: true,
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

    after(async () => {
      await attemptWebhookDelivery(webhookEventIds);
    });

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Customer created successfully', {
      requestId,
      teamId,
      customerId: response.data.id,
      customerEmail: response.data.email,
      customerName: response.data.fullName,
      hasDiscordAccount: !!response.data.discordAccount,
      discordUsername: response.data.discordAccount?.username || null,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.CREATED,
    });

    return NextResponse.json(response, { status: HttpStatus.CREATED });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Create customer failed', {
      requestId,
      teamId,
      route: '/v1/dev/teams/[teamId]/customers',
      error: error instanceof Error ? error.message : String(error),
      errorType:
        error instanceof SyntaxError
          ? 'SyntaxError'
          : error?.constructor?.name || 'Unknown',
      responseTimeMs: responseTime,
      ipAddress,
      userAgent,
    });

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
