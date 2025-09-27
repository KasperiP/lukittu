import { createAuditLog } from '@/lib/logging/audit-log';
import { DiscordUser, fetchDiscordUserById } from '@/lib/providers/discord';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { getIp } from '@/lib/utils/header-helpers';
import {
  setCustomerSchema,
  SetCustomerSchema,
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
  deleteCustomerPayload,
  logger,
  prisma,
  regex,
  WebhookEventType,
} from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ teamId: string; customerId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const { teamId, customerId } = params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();

  try {
    logger.info('Dev API: Get customer by ID request started', {
      requestId,
      teamId,
      customerId,
      route: '/v1/dev/teams/[teamId]/customers/[customerId]',
      method: 'GET',
      userAgent,
      timestamp: requestTime.toISOString(),
      ipAddress,
    });

    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid teamId format provided for customer lookup',
        {
          requestId,
          providedTeamId: teamId,
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

    if (!customerId || !regex.uuidV4.test(customerId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid customerId format provided for customer lookup',
        {
          requestId,
          teamId,
          providedCustomerId: customerId,
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
            details: 'Invalid customerId',
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
        'Dev API: API key authentication failed for customer lookup',
        {
          requestId,
          teamId,
          customerId,
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

    const customer = await prisma.customer.findUnique({
      where: {
        id: customerId,
        teamId,
      },
      include: {
        metadata: true,
        address: true,
        discordAccount: true,
      },
    });

    if (!customer) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Customer not found for lookup', {
        requestId,
        teamId,
        customerId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.NOT_FOUND,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Customer not found',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.NOT_FOUND,
        },
      );
    }

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Customer found successfully', {
      requestId,
      teamId,
      customerId,
      customerEmail: customer.email,
      customerName: customer.fullName,
      hasAddress: !!customer.address,
      hasDiscordAccount: !!customer.discordAccount,
      discordUsername: customer.discordAccount?.username || null,
      metadataCount: customer.metadata.length,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(
      {
        data: customer,
        result: {
          details: 'Customer found',
          timestamp: new Date(),
          valid: true,
        },
      },
      {
        status: HttpStatus.OK,
      },
    );
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Get customer by ID failed', {
      requestId,
      teamId,
      customerId,
      route: '/v1/dev/teams/[teamId]/customers/[customerId]',
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

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ teamId: string; customerId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const { teamId, customerId } = params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();

  try {
    logger.info('Dev API: Update customer request started', {
      requestId,
      teamId,
      customerId,
      route: '/v1/dev/teams/[teamId]/customers/[customerId]',
      method: 'PUT',
      userAgent,
      timestamp: requestTime.toISOString(),
      ipAddress,
    });

    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid teamId format provided for customer update',
        {
          requestId,
          providedTeamId: teamId,
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

    if (!customerId || !regex.uuidV4.test(customerId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid customerId format provided for customer update',
        {
          requestId,
          teamId,
          providedCustomerId: customerId,
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
            details: 'Invalid customerId',
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
        'Dev API: API key authentication failed for customer update',
        {
          requestId,
          teamId,
          customerId,
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

      logger.warn('Dev API: Customer update validation failed', {
        requestId,
        teamId,
        customerId,
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

    // Discord validation and user fetching
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
        const responseTime = Date.now() - requestTime.getTime();

        logger.warn(
          'Dev API: Discord account already linked to another customer during update',
          {
            requestId,
            teamId,
            customerId,
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
        const discordApiStartTime = Date.now();
        discordUser = await fetchDiscordUserById(discordId);
        const discordApiTime = Date.now() - discordApiStartTime;

        if (!discordUser) {
          const responseTime = Date.now() - requestTime.getTime();

          logger.warn('Dev API: Discord user not found for customer update', {
            requestId,
            teamId,
            customerId,
            discordId,
            discordApiTimeMs: discordApiTime,
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

        logger.info(
          'Dev API: Discord user fetched successfully for customer update',
          {
            requestId,
            teamId,
            customerId,
            discordId,
            discordUsername: discordUser.username,
            discordAvatar: discordUser.avatar,
            discordApiTimeMs: discordApiTime,
          },
        );
      } catch (error) {
        const responseTime = Date.now() - requestTime.getTime();

        logger.error(
          'Dev API: Failed to fetch Discord user for customer update',
          {
            requestId,
            teamId,
            customerId,
            discordId,
            error: error instanceof Error ? error.message : String(error),
            errorType: error?.constructor?.name || 'Unknown',
            responseTimeMs: responseTime,
            ipAddress,
            userAgent,
          },
        );

        return NextResponse.json(
          {
            data: null,
            result: {
              details: 'Failed to validate Discord user',
              timestamp: new Date(),
              valid: false,
            },
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }
    }

    const existingCustomer = await prisma.customer.findUnique({
      where: {
        id: customerId,
        teamId,
      },
    });

    if (!existingCustomer) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Customer not found for update', {
        requestId,
        teamId,
        customerId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.NOT_FOUND,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Customer not found',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.NOT_FOUND,
        },
      );
    }

    let webhookEventIds: string[] = [];

    const response = await prisma.$transaction(async (prisma) => {
      const updatedCustomer = await prisma.customer.update({
        where: {
          teamId,
          id: customerId,
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
                      discordId,
                      username: discordUser.username,
                      avatar: discordUser.avatar,
                      globalName: discordUser.global_name,
                    },
                  },
                }
              : discordId === null || discordId === ''
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

      const response: IExternalDevResponse = {
        data: updatedCustomer,
        result: {
          details: 'Customer updated',
          timestamp: new Date(),
          valid: true,
        },
      };

      await createAuditLog({
        teamId: team.id,
        action: AuditLogAction.UPDATE_CUSTOMER,
        targetId: customerId,
        targetType: AuditLogTargetType.CUSTOMER,
        requestBody: body,
        responseBody: response,
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.CUSTOMER_UPDATED,
        teamId: team.id,
        payload: createCustomerPayload(updatedCustomer),
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      return response;
    });

    void attemptWebhookDelivery(webhookEventIds);

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Customer updated successfully', {
      requestId,
      teamId,
      customerId,
      customerEmail: response.data.email,
      customerName: response.data.fullName,
      hasDiscordAccount: !!response.data.discordAccount,
      discordUsername: response.data.discordAccount?.username || null,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(response, { status: HttpStatus.OK });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Update customer failed', {
      requestId,
      teamId,
      customerId,
      route: '/v1/dev/teams/[teamId]/customers/[customerId]',
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

export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ teamId: string; customerId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const { teamId, customerId } = params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();

  try {
    logger.info('Dev API: Delete customer request started', {
      requestId,
      teamId,
      customerId,
      route: '/v1/dev/teams/[teamId]/customers/[customerId]',
      method: 'DELETE',
      userAgent,
      timestamp: requestTime.toISOString(),
      ipAddress,
    });

    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid teamId format provided for customer deletion',
        {
          requestId,
          providedTeamId: teamId,
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

    if (!customerId || !regex.uuidV4.test(customerId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid customerId format provided for customer deletion',
        {
          requestId,
          teamId,
          providedCustomerId: customerId,
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
            details: 'Invalid customerId',
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
        'Dev API: API key authentication failed for customer deletion',
        {
          requestId,
          teamId,
          customerId,
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

    const customer = await prisma.customer.findUnique({
      where: {
        id: customerId,
        teamId,
      },
      include: {
        metadata: true,
        address: true,
        discordAccount: true,
      },
    });

    if (!customer) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Customer not found for deletion', {
        requestId,
        teamId,
        customerId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.NOT_FOUND,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Customer not found',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.NOT_FOUND,
        },
      );
    }

    let webhookEventIds: string[] = [];

    const response = await prisma.$transaction(async (prisma) => {
      await prisma.customer.delete({
        where: {
          id: customer.id,
          teamId,
        },
      });

      const response: IExternalDevResponse = {
        data: {
          customerId,
          deleted: true,
        },
        result: {
          details: 'Customer deleted successfully',
          timestamp: new Date(),
          valid: true,
        },
      };

      await createAuditLog({
        teamId: team.id,
        action: AuditLogAction.DELETE_CUSTOMER,
        targetId: customer.id,
        targetType: AuditLogTargetType.CUSTOMER,
        requestBody: null,
        responseBody: response,
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.CUSTOMER_DELETED,
        teamId: team.id,
        payload: deleteCustomerPayload(customer),
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      return response;
    });

    void attemptWebhookDelivery(webhookEventIds);

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Customer deleted successfully', {
      requestId,
      teamId,
      customerId,
      customerEmail: customer.email,
      customerName: customer.fullName,
      hasDiscordAccount: !!customer.discordAccount,
      discordUsername: customer.discordAccount?.username || null,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(response, {
      status: HttpStatus.OK,
    });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Delete customer failed', {
      requestId,
      teamId,
      customerId,
      route: '/v1/dev/teams/[teamId]/customers/[customerId]',
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
