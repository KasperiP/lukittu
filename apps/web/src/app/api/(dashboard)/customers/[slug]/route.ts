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
  deleteCustomerPayload,
  logger,
  Metadata,
  prisma,
  regex,
  User,
  WebhookEventType,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { after, NextRequest, NextResponse } from 'next/server';

export type ICustomerGetSuccessResponse = {
  customer: Customer & {
    address: Address | null;
    metadata: Metadata[];
    discordAccount: CustomerDiscordAccount | null;
    createdBy: Omit<User, 'passwordHash'> | null;
  };
};

export type ICustomerGetResponse = ICustomerGetSuccessResponse | ErrorResponse;

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ICustomerGetResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const customerId = params.slug;

    if (!customerId || !regex.uuidV4.test(customerId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

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
              customers: {
                where: {
                  id: customerId,
                },
                include: {
                  createdBy: true,
                  address: true,
                  metadata: true,
                  discordAccount: true,
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

    if (!team.customers.length) {
      return NextResponse.json(
        {
          message: t('validation.customer_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const customer = team.customers[0];

    return NextResponse.json(
      {
        customer,
      },
      { status: HttpStatus.OK },
    );
  } catch (error) {
    logger.error("Error occurred in 'customers/[slug]' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

export type ICustomersUpdateSuccessResponse = {
  customer: Customer & {
    address: Address | null;
    metadata: Metadata[];
    discordAccount: CustomerDiscordAccount | null;
  };
};

export type ICustomersUpdateResponse =
  | ErrorResponse
  | ICustomersUpdateSuccessResponse;

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ICustomersUpdateResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const customerId = params.slug;

    if (!customerId || !regex.uuidV4.test(customerId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

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
              customers: {
                where: {
                  id: customerId,
                },
                include: {
                  discordAccount: true,
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

    if (!team.customers.length) {
      return NextResponse.json(
        {
          message: t('validation.customer_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const existingCustomer = team.customers[0];

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

      // If Discord account exists and it's not the current customer, return error
      if (
        existingDiscordAccount &&
        existingDiscordAccount.customerId !== customerId
      ) {
        return NextResponse.json(
          {
            field: 'discordId',
            message: t('validation.discord_account_already_linked'),
            customerId: existingDiscordAccount.customerId,
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
      const updatedCustomer = await prisma.customer.update({
        where: {
          id: customerId,
          teamId: team.id,
        },
        data: {
          email,
          fullName,
          username,
          metadata: {
            deleteMany: {},
            createMany: {
              data: metadata.map((m) => ({
                ...m,
                teamId: team.id,
              })),
            },
          },
          address: address
            ? {
                upsert: {
                  create: address,
                  update: address,
                },
              }
            : { delete: true },
          discordAccount:
            discordUser && discordId
              ? {
                  upsert: {
                    create: {
                      discordId,
                      username: discordUser.username,
                      avatar: discordUser.avatar,
                      globalName: discordUser.global_name,
                      teamId: team.id,
                    },
                    update: {
                      username: discordUser.username,
                      avatar: discordUser.avatar,
                      globalName: discordUser.global_name,
                      discordId,
                    },
                  },
                }
              : existingCustomer.discordAccount
                ? {
                    delete: true,
                  }
                : undefined,
        },
        include: {
          metadata: true,
          address: true,
          discordAccount: true,
        },
      });

      const response = {
        customer: updatedCustomer,
      };

      await createAuditLog({
        userId: session.user.id,
        teamId: team.id,
        action: AuditLogAction.UPDATE_CUSTOMER,
        targetId: customerId,
        targetType: AuditLogTargetType.CUSTOMER,
        requestBody: body,
        responseBody: response,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.CUSTOMER_UPDATED,
        teamId: team.id,
        payload: createCustomerPayload(updatedCustomer),
        userId: session.user.id,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      return response;
    });

    after(async () => {
      await attemptWebhookDelivery(webhookEventIds);
    });

    return NextResponse.json(response, { status: HttpStatus.OK });
  } catch (error) {
    logger.error("Error occurred in 'customers/[slug]' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

type ICustomersDeleteSuccessResponse = {
  success: boolean;
};

export type ICustomersDeleteResponse =
  | ErrorResponse
  | ICustomersDeleteSuccessResponse;

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ICustomersDeleteResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const customerId = params.slug;

    if (!customerId || !regex.uuidV4.test(customerId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

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
              customers: {
                where: {
                  id: customerId,
                },
                include: {
                  metadata: true,
                  address: true,
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

    if (!team.customers.length) {
      return NextResponse.json(
        {
          message: t('validation.customer_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const customerToDelete = team.customers[0];

    let webhookEventIds: string[] = [];

    const response = await prisma.$transaction(async (prisma) => {
      await prisma.customer.delete({
        where: {
          id: customerId,
          teamId: team.id,
        },
      });

      const response = {
        success: true,
      };

      await createAuditLog({
        userId: session.user.id,
        teamId: team.id,
        action: AuditLogAction.DELETE_CUSTOMER,
        targetId: customerId,
        targetType: AuditLogTargetType.CUSTOMER,
        requestBody: null,
        responseBody: response,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.CUSTOMER_DELETED,
        teamId: team.id,
        payload: deleteCustomerPayload(customerToDelete),
        userId: session.user.id,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      return response;
    });

    after(async () => {
      await attemptWebhookDelivery(webhookEventIds);
    });

    return NextResponse.json(response, { status: HttpStatus.OK });
  } catch (error) {
    logger.error("Error occurred in 'customers/[slug]' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
