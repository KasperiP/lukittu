import { createAuditLog } from '@/lib/logging/audit-log';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { getIp } from '@/lib/utils/header-helpers';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  attemptWebhookDelivery,
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  createWebhookEvents,
  deleteLicensePayload,
  generateHMAC,
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
  props: { params: Promise<{ teamId: string; licenseKey: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const { teamId, licenseKey } = params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();

  try {
    logger.info('Dev API: Get license by key request started', {
      requestId,
      teamId,
      licenseKey,
      route: '/v1/dev/teams/[teamId]/licenses/[licenseKey]',
      method: 'GET',
      userAgent,
      timestamp: requestTime.toISOString(),
      ipAddress,
    });

    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid teamId format provided for license lookup',
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

    if (!licenseKey || !regex.licenseKey.test(licenseKey)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Invalid license key format provided', {
        requestId,
        teamId,
        providedLicenseKey: licenseKey,
        expectedFormat: 'Valid license key pattern',
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid licenseKey',
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

      logger.warn('Dev API: API key authentication failed for license lookup', {
        requestId,
        teamId,
        licenseKey,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.UNAUTHORIZED,
        ipAddress,
        userAgent,
      });

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

    const hmac = generateHMAC(`${licenseKey}:${teamId}`);

    const license = await prisma.license.findUnique({
      where: {
        teamId_licenseKeyLookup: {
          teamId,
          licenseKeyLookup: hmac,
        },
      },
      include: {
        customers: {
          include: {
            metadata: true,
          },
        },
        products: {
          include: {
            metadata: true,
          },
        },
        metadata: true,
      },
    });

    if (!license) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.info('Dev API: License not found', {
        requestId,
        teamId,
        licenseKey,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.NOT_FOUND,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'License not found',
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

    logger.info('Dev API: License found successfully', {
      requestId,
      teamId,
      licenseKey,
      licenseId: license.id,
      customerCount: license.customers.length,
      productCount: license.products.length,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(
      {
        data: {
          ...license,

          /** @deprecated Use hwidLimit */
          seats: license.hwidLimit,
          licenseKey,
        },
        result: {
          details: 'License found',
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

    logger.error('Dev API: Get license by key failed', {
      requestId,
      teamId,
      licenseKey,
      route: '/v1/dev/teams/[teamId]/licenses/[licenseKey]',
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

export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ teamId: string; licenseKey: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const { teamId, licenseKey } = params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();

  try {
    logger.info('Dev API: Delete license by key request started', {
      requestId,
      teamId,
      licenseKey,
      route: '/v1/dev/teams/[teamId]/licenses/[licenseKey]',
      method: 'DELETE',
      userAgent,
      timestamp: requestTime.toISOString(),
      ipAddress,
    });

    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid teamId format provided for license deletion',
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

    if (!licenseKey || !regex.licenseKey.test(licenseKey)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Invalid license key format provided for deletion', {
        requestId,
        teamId,
        providedLicenseKey: licenseKey,
        expectedFormat: 'Valid license key pattern',
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid licenseKey',
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
        'Dev API: API key authentication failed for license deletion',
        {
          requestId,
          teamId,
          licenseKey,
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

    const hmac = generateHMAC(`${licenseKey}:${teamId}`);

    const license = await prisma.license.findUnique({
      where: {
        teamId_licenseKeyLookup: {
          teamId,
          licenseKeyLookup: hmac,
        },
      },
      include: {
        products: true,
        customers: true,
        metadata: true,
      },
    });

    if (!license) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: License not found for deletion', {
        requestId,
        teamId,
        licenseKey,
        hmacGenerated: hmac.substring(0, 8) + '...',
        responseTimeMs: responseTime,
        statusCode: HttpStatus.NOT_FOUND,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'License not found',
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
      await prisma.license.delete({
        where: {
          id: license.id,
          teamId: team.id,
        },
      });

      const response = {
        data: {
          licenseKey,
          deleted: true,
        },
        result: {
          details: 'License deleted successfully',
          timestamp: new Date(),
          valid: true,
        },
      };

      await createAuditLog({
        teamId: team.id,
        action: AuditLogAction.DELETE_LICENSE,
        targetId: license.id,
        targetType: AuditLogTargetType.LICENSE,
        requestBody: null,
        responseBody: response,
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.LICENSE_DELETED,
        teamId: team.id,
        payload: deleteLicensePayload(license),
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      return response;
    });

    void attemptWebhookDelivery(webhookEventIds);

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: License deleted successfully', {
      requestId,
      teamId,
      licenseKey,
      licenseId: license.id,
      customerCount: license.customers.length,
      productCount: license.products.length,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(response, {
      status: HttpStatus.OK,
    });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Delete license by key failed', {
      requestId,
      teamId,
      licenseKey,
      route: '/v1/dev/teams/[teamId]/licenses/[licenseKey]',
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
