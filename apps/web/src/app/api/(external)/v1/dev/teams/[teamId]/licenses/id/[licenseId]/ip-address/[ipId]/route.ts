import { createAuditLog } from '@/lib/logging/audit-log';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  logger,
  prisma,
  regex,
} from '@lukittu/shared';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  props: {
    params: Promise<{ teamId: string; licenseId: string; ipId: string }>;
  },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId, licenseId, ipId } = params;

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

    if (!licenseId || !regex.uuidV4.test(licenseId)) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid licenseId',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.BAD_REQUEST,
        },
      );
    }

    if (!ipId || !regex.uuidV4.test(ipId)) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid ipId',
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

    const body = await request.json();
    const { forgotten } = body;

    if (typeof forgotten !== 'boolean') {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid forgotten value, must be boolean',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.BAD_REQUEST,
        },
      );
    }

    // Verify the IP address exists and belongs to the license/team
    const existingIp = await prisma.ipAddress.findUnique({
      where: {
        id: ipId,
        licenseId,
        teamId,
      },
      select: {
        id: true,
        licenseId: true,
        teamId: true,
      },
    });

    if (
      !existingIp ||
      existingIp.licenseId !== licenseId ||
      existingIp.teamId !== teamId
    ) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'IP address not found',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.NOT_FOUND,
        },
      );
    }

    const response = await prisma.$transaction(async (prisma) => {
      await prisma.ipAddress.update({
        where: {
          id: ipId,
        },
        data: {
          forgotten: Boolean(forgotten),
        },
      });

      const response: IExternalDevResponse = {
        data: {
          ipId,
          forgotten: Boolean(forgotten),
          updated: true,
        },
        result: {
          details: forgotten
            ? 'IP address forgotten successfully'
            : 'IP address remembered successfully',
          timestamp: new Date(),
          valid: true,
        },
      };

      await createAuditLog({
        teamId: team.id,
        action: forgotten
          ? AuditLogAction.FORGET_IP
          : AuditLogAction.REMEMBER_IP,
        targetId: ipId,
        targetType: AuditLogTargetType.IP_ADDRESS,
        requestBody: { forgotten },
        responseBody: response,
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      return response;
    });

    return NextResponse.json(response, {
      status: HttpStatus.OK,
    });
  } catch (error) {
    logger.error(
      "Error in PATCH '(external)/v1/dev/teams/[teamId]/licenses/id/[licenseId]/ip-address/[ipId]' route",
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
