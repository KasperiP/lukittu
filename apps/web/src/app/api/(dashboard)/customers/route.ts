import { createAuditLog } from '@/lib/logging/audit-log';
import { DiscordUser, fetchDiscordUserById } from '@/lib/providers/discord';
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
  attemptWebhookDelivery,
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  createCustomerPayload,
  createWebhookEvents,
  Customer,
  CustomerDiscordAccount,
  logger,
  Metadata,
  prisma,
  Prisma,
  regex,
  WebhookEventType,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { after, NextRequest, NextResponse } from 'next/server';

export type ICustomersGetSuccessResponse = {
  customers: (Customer & {
    address: Address | null;
    metadata: Metadata[];
    discordAccount: CustomerDiscordAccount | null;
  })[];
  totalResults: number;
  hasResults: boolean;
};

export type ICustomersCreateSuccessResponse = {
  customer: Customer & {
    address: Address | null;
    metadata: Metadata[];
    discordAccount: CustomerDiscordAccount | null;
  };
};

export type ICustomersCreateResponse =
  | ErrorResponse
  | ICustomersCreateSuccessResponse;

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
    const allowedSortColumns = [
      'fullName',
      'createdAt',
      'updatedAt',
      'email',
      'username',
    ];

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
          const baseQuery = Prisma.sql`
            SELECT c.id
            FROM "Customer" c
            LEFT JOIN "_CustomerToLicense" cl ON c.id = cl."A"
            LEFT JOIN "License" l ON cl."B" = l.id
            WHERE c."teamId" = ${selectedTeam}
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
      teamId: selectedTeam,
    } as Prisma.CustomerWhereInput;

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
              id: selectedTeam,
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

    const [customers, hasResults, totalResults] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: {
          [sortColumn]: sortDirection,
        },
        skip,
        take,
        include: {
          address: true,
          metadata: true,
          discordAccount: true,
        },
      }),
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

    const { email, fullName, metadata, address, username, discordId } =
      validated.data;

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
        return NextResponse.json(
          {
            field: 'discordId',
            message: t('validation.discord_account_already_linked'),
            customerId: existingDiscordAccount.customer.id,
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }

      try {
        discordUser = await fetchDiscordUserById(discordId);

        if (!discordUser) {
          return NextResponse.json(
            {
              field: 'discordId',
              message: t('validation.discord_user_not_found'),
            },
            { status: HttpStatus.BAD_REQUEST },
          );
        }
      } catch (error) {
        logger.warn('Failed to fetch Discord user data for user', {
          discordId,
          error: error instanceof Error ? error.message : String(error),
        });

        return NextResponse.json(
          {
            field: 'discordId',
            message: t('validation.discord_api_error'),
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
                    discordId,
                    username: discordUser.username,
                    avatar: discordUser.avatar,
                    globalName: discordUser.global_name,
                    teamId: team.id,
                  },
                }
              : undefined,
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
          address: true,
          discordAccount: true,
        },
      });

      const response = {
        customer,
      };

      await createAuditLog({
        userId: session.user.id,
        teamId: team.id,
        action: AuditLogAction.CREATE_CUSTOMER,
        targetId: customer.id,
        targetType: AuditLogTargetType.CUSTOMER,
        requestBody: body,
        responseBody: response,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.CUSTOMER_CREATED,
        teamId: team.id,
        payload: createCustomerPayload(customer),
        userId: session.user.id,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      return response;
    });

    after(async () => {
      await attemptWebhookDelivery(webhookEventIds);
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
