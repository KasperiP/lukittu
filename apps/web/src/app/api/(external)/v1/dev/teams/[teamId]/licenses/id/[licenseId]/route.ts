import { createAuditLog } from '@/lib/logging/audit-log';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { getIp } from '@/lib/utils/header-helpers';
import {
  SetLicenseScheama,
  setLicenseSchema,
} from '@/lib/validation/licenses/set-license-schema';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  attemptWebhookDelivery,
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  createWebhookEvents,
  decryptLicenseKey,
  deleteLicensePayload,
  encryptLicenseKey,
  generateHMAC,
  logger,
  prisma,
  regex,
  updateLicensePayload,
  WebhookEventType,
} from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ teamId: string; licenseId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();
  const { teamId, licenseId } = params;

  logger.info('Dev API: Get license request started', {
    requestId,
    teamId,
    licenseId,
    route: '/v1/dev/teams/[teamId]/licenses/id/[licenseId]',
    method: 'GET',
    userAgent,
    ipAddress,
    timestamp: requestTime.toISOString(),
  });

  try {
    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: Invalid teamId format provided for license lookup by ID',
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
        'Dev API: Invalid licenseId format provided for license lookup',
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

    const { team } = await verifyApiAuthorization(teamId);

    if (!team) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: API key authentication failed for license lookup by ID',
        {
          requestId,
          teamId,
          licenseId,
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

    const license = await prisma.license.findUnique({
      where: {
        id: licenseId,
        teamId,
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
      },
    });

    if (!license) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: License not found for lookup by ID', {
        requestId,
        teamId,
        licenseId,
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

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Get license completed successfully', {
      requestId,
      teamId,
      licenseId,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(
      {
        data: {
          ...license,

          /** @deprecated Use hwidLimit */
          seats: license.hwidLimit,
          licenseKey: decryptLicenseKey(license.licenseKey),
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

    logger.error('Dev API: Get license failed', {
      requestId,
      teamId,
      licenseId,
      route: '/v1/dev/teams/[teamId]/licenses/id/[licenseId]',
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
  props: { params: Promise<{ teamId: string; licenseId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();
  const { teamId, licenseId } = params;

  logger.info('Dev API: Update license request started', {
    requestId,
    teamId,
    licenseId,
    route: '/v1/dev/teams/[teamId]/licenses/id/[licenseId]',
    method: 'PUT',
    userAgent,
    ipAddress,
    timestamp: requestTime.toISOString(),
  });

  try {
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

    const body = (await request.json()) as SetLicenseScheama;
    const validated = await setLicenseSchema().safeParseAsync(body);

    if (!validated.success) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: License update validation failed', {
        requestId,
        teamId,
        licenseId,
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
          data: validated.error.errors.map((error) => ({
            message: error.message,
            path: error.path,
          })),
          result: {
            details: 'Invalid request body',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.BAD_REQUEST,
        },
      );
    }

    const {
      licenseKey,
      customerIds,
      expirationDate,
      expirationDays,
      expirationStart,
      expirationType,
      ipLimit,
      metadata,
      productIds,
      hwidLimit,
      suspended,
    } = validated.data;

    // Verify the license exists and belongs to this team
    const existingLicense = await prisma.license.findUnique({
      where: {
        id: licenseId,
        teamId,
      },
      select: {
        id: true,
        licenseKey: true,
        licenseKeyLookup: true,
      },
    });

    if (!existingLicense) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: License not found for update', {
        requestId,
        teamId,
        licenseId,
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

    // Validate products and customers belong to the team
    const productsPromise = prisma.product.findMany({
      where: {
        teamId: team.id,
        id: {
          in: productIds,
        },
      },
    });

    const customersPromise = prisma.customer.findMany({
      where: {
        teamId: team.id,
        id: {
          in: customerIds,
        },
      },
    });

    const [products, customers] = await Promise.all([
      productsPromise,
      customersPromise,
    ]);

    if (products.length !== productIds.length) {
      const responseTime = Date.now() - requestTime.getTime();
      const foundProductIds = products.map((p) => p.id);
      const missingProductIds = productIds.filter(
        (id) => !foundProductIds.includes(id),
      );

      logger.warn('Dev API: Referenced products not found for license update', {
        requestId,
        teamId,
        licenseId,
        requestedProductIds: productIds,
        foundProductIds,
        missingProductIds,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid productIds',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (customers.length !== customerIds.length) {
      const responseTime = Date.now() - requestTime.getTime();
      const foundCustomerIds = customers.map((c) => c.id);
      const missingCustomerIds = customerIds.filter(
        (id) => !foundCustomerIds.includes(id),
      );

      logger.warn(
        'Dev API: Referenced customers not found for license update',
        {
          requestId,
          teamId,
          licenseId,
          requestedCustomerIds: customerIds,
          foundCustomerIds,
          missingCustomerIds,
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
            details: 'Invalid customerIds',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Handle license key change if provided
    let encryptedLicenseKey = existingLicense.licenseKey;
    let hmac = existingLicense.licenseKeyLookup;

    if (licenseKey !== decryptLicenseKey(existingLicense.licenseKey)) {
      // Check if the new license key is already in use
      const existingKeyCheck = await prisma.license.findFirst({
        where: {
          teamId: team.id,
          licenseKeyLookup: generateHMAC(`${licenseKey}:${teamId}`),
          NOT: {
            id: licenseId,
          },
        },
      });

      if (existingKeyCheck) {
        const responseTime = Date.now() - requestTime.getTime();

        logger.warn('Dev API: License key already exists during update', {
          requestId,
          teamId,
          licenseId,
          existingLicenseId: existingKeyCheck.id,
          responseTimeMs: responseTime,
          statusCode: HttpStatus.BAD_REQUEST,
          ipAddress,
          userAgent,
        });

        return NextResponse.json(
          {
            data: null,
            result: {
              details: 'License key already exists',
              timestamp: new Date(),
              valid: false,
            },
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }

      encryptedLicenseKey = encryptLicenseKey(licenseKey);
      hmac = generateHMAC(`${licenseKey}:${teamId}`);
    }

    let webhookEventIds: string[] = [];

    const response = await prisma.$transaction(async (prisma) => {
      const updatedLicense = await prisma.license.update({
        where: {
          id: licenseId,
          teamId,
        },
        data: {
          expirationDate,
          expirationDays,
          expirationStart: expirationStart || 'CREATION',
          expirationType,
          ipLimit,
          licenseKey: encryptedLicenseKey,
          licenseKeyLookup: hmac,
          suspended,
          hwidLimit,
          metadata: {
            deleteMany: {},
            createMany: {
              data: metadata.map((m) => ({
                ...m,
                teamId: team.id,
              })),
            },
          },
          products: {
            set: productIds.map((id) => ({ id })),
          },
          customers: {
            set: customerIds.map((id) => ({ id })),
          },
        },
        include: {
          customers: true,
          products: true,
          metadata: true,
        },
      });

      const response: IExternalDevResponse = {
        data: {
          ...updatedLicense,
          licenseKey,
          licenseKeyLookup: undefined,
        },
        result: {
          details: 'License updated',
          timestamp: new Date(),
          valid: true,
        },
      };

      await createAuditLog({
        teamId: team.id,
        action: AuditLogAction.UPDATE_LICENSE,
        targetId: licenseId,
        targetType: AuditLogTargetType.LICENSE,
        requestBody: body,
        responseBody: response,
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.LICENSE_UPDATED,
        teamId: team.id,
        payload: updateLicensePayload(updatedLicense),
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      return response;
    });

    void attemptWebhookDelivery(webhookEventIds);

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Update license completed successfully', {
      requestId,
      teamId,
      licenseId,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(response, {
      status: HttpStatus.OK,
    });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Update license failed', {
      requestId,
      teamId,
      licenseId,
      route: '/v1/dev/teams/[teamId]/licenses/id/[licenseId]',
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
  props: { params: Promise<{ teamId: string; licenseId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();
  const { teamId, licenseId } = params;

  logger.info('Dev API: Delete license request started', {
    requestId,
    teamId,
    licenseId,
    route: '/v1/dev/teams/[teamId]/licenses/id/[licenseId]',
    method: 'DELETE',
    userAgent,
    ipAddress,
    timestamp: requestTime.toISOString(),
  });

  try {
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

    const license = await prisma.license.findUnique({
      where: {
        id: licenseId,
        teamId,
      },
      include: {
        products: true,
        customers: true,
        metadata: true,
      },
    });

    if (!license) {
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

      const response: IExternalDevResponse = {
        data: {
          licenseId,
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

    logger.info('Dev API: Delete license completed successfully', {
      requestId,
      teamId,
      licenseId,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(response, {
      status: HttpStatus.OK,
    });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Delete license failed', {
      requestId,
      teamId,
      licenseId,
      route: '/v1/dev/teams/[teamId]/licenses/id/[licenseId]',
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
