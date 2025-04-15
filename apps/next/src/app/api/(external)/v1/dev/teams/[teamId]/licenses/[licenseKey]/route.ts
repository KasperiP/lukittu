import { regex } from '@/lib/constants/regex';
import prisma from '@/lib/database/prisma';
import { logger } from '@/lib/logging/logger';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { generateHMAC } from '@/lib/security/crypto';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
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

    await prisma.license.delete({
      where: {
        id: license.id,
      },
    });

    return NextResponse.json(
      {
        data: {
          licenseKey,
          deleted: true,
        },
        result: {
          details: 'License deleted successfully',
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
