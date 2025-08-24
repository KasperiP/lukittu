import { createAuditLog } from '@/lib/logging/audit-log';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { getIp } from '@/lib/utils/header-helpers';
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
import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  props: {
    params: Promise<{ teamId: string; licenseId: string; ipId: string }>;
  },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();
  const { teamId, licenseId, ipId } = params;

  logger.info('Dev API: Manage IP address request started', {
    requestId,
    teamId,
    licenseId,
    ipId,
    route: '/v1/dev/teams/[teamId]/licenses/id/[licenseId]/ip-address/[ipId]',
    method: 'PATCH',
    userAgent,
    ipAddress,
    timestamp: requestTime.toISOString(),
  });

  try {
    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid teamId format provided for IP address management',
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

    if (!licenseId || !regex.uuidV4.test(licenseId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid licenseId format provided for IP address management',
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
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid ipId format provided for IP address management',
        {
          requestId,
          teamId,
          licenseId,
          providedIpId: ipId,
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
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: API key authentication failed for IP address management',
        {
          requestId,
          teamId,
          licenseId,
          ipId,
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

    const body = await request.json();
    const { forgotten } = body;

    if (typeof forgotten !== 'boolean') {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid forgotten value provided for IP address management',
        {
          requestId,
          teamId,
          licenseId,
          ipId,
          providedValue: forgotten,
          expectedType: 'boolean',
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
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: IP address not found for management', {
        requestId,
        teamId,
        licenseId,
        ipId,
        existingIpFound: !!existingIp,
        licenseIdMatch: existingIp?.licenseId === licenseId,
        teamIdMatch: existingIp?.teamId === teamId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.NOT_FOUND,
        ipAddress,
        userAgent,
      });

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
          licenseId,
          teamId,
        },
        data: {
          forgotten: Boolean(forgotten),
        },
      });

      const response: IExternalDevResponse = {
        data: {
          ipId,
          forgotten: Boolean(forgotten),
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

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Manage IP address completed successfully', {
      requestId,
      teamId,
      licenseId,
      ipId,
      action: forgotten ? 'forgotten' : 'remembered',
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(response, {
      status: HttpStatus.OK,
    });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Manage IP address failed', {
      requestId,
      teamId,
      licenseId,
      ipId,
      route: '/v1/dev/teams/[teamId]/licenses/id/[licenseId]/ip-address/[ipId]',
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
