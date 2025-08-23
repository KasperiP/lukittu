import {
  IExternalVerificationResponse,
  loggedResponse,
} from '@/lib/logging/request-log';
import { getCloudflareVisitorData } from '@/lib/providers/cloudflare';
import { getIp } from '@/lib/utils/header-helpers';
import { LicenseHeartbeatSchema } from '@/lib/validation/licenses/license-heartbeat-schema';
import { handleHeartbeat } from '@/lib/verification/heartbeat';
import { HttpStatus } from '@/types/http-status';
import { logger, RequestStatus, RequestType } from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
): Promise<NextResponse<IExternalVerificationResponse>> {
  const params = await props.params;
  const requestTime = new Date();
  const teamId = params.teamId;
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';

  logger.info('License heartbeat: Request started', {
    requestId,
    teamId,
    route: '/v1/client/teams/[teamId]/verification/heartbeat',
    method: 'POST',
    userAgent,
    timestamp: requestTime.toISOString(),
  });

  const loggedResponseBase = {
    body: null,
    request,
    requestTime,
    type: RequestType.HEARTBEAT,
  };

  const geoData = await getCloudflareVisitorData();
  const ipAddress = await getIp();

  try {
    const rawBody = await request.json();

    /**
     * @deprecated use hardwareIdentifier. Only for backward compatibility.
     */
    const legacyDeviceIdentifier = rawBody.deviceIdentifier;

    const body = {
      ...rawBody,
      hardwareIdentifier: rawBody.hardwareIdentifier || legacyDeviceIdentifier,
    } as LicenseHeartbeatSchema;

    logger.info('License heartbeat: Processing license heartbeat', {
      requestId,
      teamId,
      licenseKey: body.licenseKey
        ? `${body.licenseKey.substring(0, 8)}...`
        : 'none',
      hardwareId: body.hardwareIdentifier
        ? `${body.hardwareIdentifier.substring(0, 8)}...`
        : 'none',
      ipAddress,
      country: geoData?.alpha2 || 'unknown',
      hasChallenge: !!body.challenge,
    });

    const result = await handleHeartbeat({
      requestId,
      teamId,
      ipAddress,
      geoData,
      payload: body,
    });

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('License heartbeat: Completed', {
      requestId,
      teamId,
      status: result.status,
      valid: result.response.result.valid,
      responseTimeMs: responseTime,
      statusCode: result.httpStatus,
    });

    return loggedResponse({
      ...loggedResponseBase,
      ...result,
    });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('License heartbeat: Failed', {
      requestId,
      teamId,
      route: '/v1/client/teams/[teamId]/verification/heartbeat',
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
      return loggedResponse({
        ...loggedResponseBase,
        status: RequestStatus.BAD_REQUEST,
        response: {
          data: null,
          result: {
            timestamp: new Date(),
            valid: false,
            details: 'Invalid JSON payload',
          },
        },
        httpStatus: HttpStatus.BAD_REQUEST,
      });
    }

    return loggedResponse({
      ...loggedResponseBase,
      status: RequestStatus.INTERNAL_SERVER_ERROR,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'Internal server error',
        },
      },
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }
}
