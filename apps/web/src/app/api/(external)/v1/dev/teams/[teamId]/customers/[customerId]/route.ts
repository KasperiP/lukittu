import { createAuditLog } from '@/lib/logging/audit-log';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
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
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ teamId: string; customerId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId, customerId } = params;

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

    if (!customerId || !regex.uuidV4.test(customerId)) {
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
      },
    });

    if (!customer) {
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
    logger.error(
      "Error in '(external)/v1/dev/teams/[teamId]/customers/[customerId]' route",
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

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ teamId: string; customerId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId, customerId } = params;

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

    if (!customerId || !regex.uuidV4.test(customerId)) {
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

    const existingCustomer = await prisma.customer.findUnique({
      where: {
        id: customerId,
        teamId,
      },
    });

    if (!existingCustomer) {
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
          address: {
            upsert: {
              create: {
                ...address,
              },
              update: {
                ...address,
              },
            },
          },
        },
        include: {
          metadata: true,
          address: true,
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

    return NextResponse.json(response, { status: HttpStatus.OK });
  } catch (error) {
    logger.error(
      "Error in PUT '(external)/v1/dev/teams/[teamId]/customers/[customerId]' route",
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

export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ teamId: string; customerId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId, customerId } = params;

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

    if (!customerId || !regex.uuidV4.test(customerId)) {
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
      },
    });

    if (!customer) {
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

    return NextResponse.json(response, {
      status: HttpStatus.OK,
    });
  } catch (error) {
    logger.error(
      "Error in DELETE '(external)/v1/dev/teams/[teamId]/customers/[customerId]' route",
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
