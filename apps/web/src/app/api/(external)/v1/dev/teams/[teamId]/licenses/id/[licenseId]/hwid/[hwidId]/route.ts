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
    params: Promise<{ teamId: string; licenseId: string; hwidId: string }>;
  },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();
  const { teamId, licenseId, hwidId } = params;

  logger.info('Dev API: Manage HWID request started', {
    requestId,
    teamId,
    licenseId,
    hwidId,
    route: '/v1/dev/teams/[teamId]/licenses/id/[licenseId]/hwid/[hwidId]',
    method: 'PATCH',
    userAgent,
    ipAddress,
    timestamp: requestTime.toISOString(),
  });

  try {
    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid teamId format provided for HWID management',
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
        'Dev API: Invalid licenseId format provided for HWID management',
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

    if (!hwidId || !regex.uuidV4.test(hwidId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid hwidId format provided for HWID management',
        {
          requestId,
          teamId,
          licenseId,
          providedHwidId: hwidId,
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
            details: 'Invalid hwidId',
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
        'Dev API: API key authentication failed for HWID management',
        {
          requestId,
          teamId,
          licenseId,
          hwidId,
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
        'Dev API: Invalid forgotten value provided for HWID management',
        {
          requestId,
          teamId,
          licenseId,
          hwidId,
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

    // Verify the hardware identifier exists and belongs to the license/team
    const existingHwid = await prisma.hardwareIdentifier.findUnique({
      where: {
        id: hwidId,
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
      !existingHwid ||
      existingHwid.licenseId !== licenseId ||
      existingHwid.teamId !== teamId
    ) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Hardware identifier not found for management', {
        requestId,
        teamId,
        licenseId,
        hwidId,
        existingHwidFound: !!existingHwid,
        licenseIdMatch: existingHwid?.licenseId === licenseId,
        teamIdMatch: existingHwid?.teamId === teamId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.NOT_FOUND,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Hardware identifier not found',
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
      await prisma.hardwareIdentifier.update({
        where: {
          id: hwidId,
          licenseId,
          teamId,
        },
        data: {
          forgotten: Boolean(forgotten),
        },
      });

      const response: IExternalDevResponse = {
        data: {
          hwidId,
          forgotten: Boolean(forgotten),
        },
        result: {
          details: forgotten
            ? 'Hardware identifier forgotten successfully'
            : 'Hardware identifier remembered successfully',
          timestamp: new Date(),
          valid: true,
        },
      };

      await createAuditLog({
        teamId: team.id,
        action: forgotten
          ? AuditLogAction.FORGET_HWID
          : AuditLogAction.REMEMBER_HWID,
        targetId: hwidId,
        targetType: AuditLogTargetType.HARDWARE_IDENTIFIER,
        requestBody: { forgotten },
        responseBody: response,
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      return response;
    });

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Manage HWID completed successfully', {
      requestId,
      teamId,
      licenseId,
      hwidId,
      action: forgotten ? 'forgotten' : 'remembered',
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(response, {
      status: HttpStatus.OK,
    });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Manage HWID failed', {
      requestId,
      teamId,
      licenseId,
      hwidId,
      route: '/v1/dev/teams/[teamId]/licenses/id/[licenseId]/hwid/[hwidId]',
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
