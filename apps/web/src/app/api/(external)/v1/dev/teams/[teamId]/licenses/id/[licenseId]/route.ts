import { createAuditLog } from '@/lib/logging/audit-log';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
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
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ teamId: string; licenseId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId, licenseId } = params;

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
    logger.error(
      "Error in '(external)/v1/dev/teams/[teamId]/licenses/id/[licenseId]' route",
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
  props: { params: Promise<{ teamId: string; licenseId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId, licenseId } = params;

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

    return NextResponse.json(response, {
      status: HttpStatus.OK,
    });
  } catch (error) {
    logger.error(
      "Error in PUT '(external)/v1/dev/teams/[teamId]/licenses/id/[licenseId]' route",
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
  props: { params: Promise<{ teamId: string; licenseId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId, licenseId } = params;

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

    return NextResponse.json(response, {
      status: HttpStatus.OK,
    });
  } catch (error) {
    logger.error(
      "Error in DELETE '(external)/v1/dev/teams/[teamId]/licenses/id/[licenseId]' route",
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
