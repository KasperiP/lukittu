import prisma from '@/lib/database/prisma';
import { createAuditLog } from '@/lib/logging/audit-log';
import { logger } from '@/lib/logging/logger';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import {
  SetCustomerSchema,
  setCustomerSchema,
} from '@/lib/validation/customers/set-customer-schema';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { AuditLogAction, AuditLogTargetType } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId } = params;

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

    const { email, fullName, metadata, address } = validated.data;
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

    const existingCustomer = await prisma.customer.findUnique({
      where: {
        email_teamId: {
          email,
          teamId: team.id,
        },
      },
    });

    if (existingCustomer) {
      return NextResponse.json(
        {
          data: {
            customer: existingCustomer,
          },
          result: {
            details: 'Customer already exists',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.CONFLICT },
      );
    }

    const customer = await prisma.customer.create({
      data: {
        email,
        fullName,
        metadata,
        address: {
          create: address,
        },
        team: {
          connect: {
            id: team.id,
          },
        },
      },
    });

    const response: IExternalDevResponse = {
      data: {
        customer,
      },
      result: {
        details: 'Customer created',
        timestamp: new Date(),
        valid: true,
      },
    };

    createAuditLog({
      system: true,
      teamId: team.id,
      action: AuditLogAction.CREATE_CUSTOMER,
      targetId: customer.id,
      targetType: AuditLogTargetType.CUSTOMER,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response, { status: HttpStatus.CREATED });
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
