import { createAuditLog } from '@/lib/logging/audit-log';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
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
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ teamId: string; licenseKey: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId, licenseKey } = params;

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

    if (!licenseKey || !regex.licenseKey.test(licenseKey)) {
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
    logger.error(
      "Error in '(external)/v1/dev/teams/[teamId]/licenses/[licenseKey]' route",
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

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ teamId: string; licenseKey: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId, licenseKey } = params;

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

    if (!licenseKey || !regex.licenseKey.test(licenseKey)) {
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

    return NextResponse.json(response, {
      status: HttpStatus.OK,
    });
  } catch (error) {
    logger.error(
      "Error in DELETE '(external)/v1/dev/teams/[teamId]/licenses/[licenseKey]' route",
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
