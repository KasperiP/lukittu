import { loggedResponse } from '@/lib/logging/request-log';
import { getCloudflareVisitorData } from '@/lib/providers/cloudflare';
import { getIp } from '@/lib/utils/header-helpers';
import { VerifyLicenseSchema } from '@/lib/validation/licenses/verify-license-schema';
import { handleVerify } from '@/lib/verification/verify';
import { HttpStatus } from '@/types/http-status';
import { logger, RequestStatus, RequestType } from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextRequest } from 'next/server';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
) {
  const params = await props.params;
  const requestTime = new Date();
  const teamId = params.teamId;
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';

  logger.info('License verify: Request started', {
    requestId,
    teamId,
    route: '/v1/client/teams/[teamId]/verification/verify',
    method: 'POST',
    userAgent,
    timestamp: requestTime.toISOString(),
  });

  const loggedResponseBase = {
    body: null,
    request,
    requestTime,
    type: RequestType.VERIFY,
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
    } as VerifyLicenseSchema;

    logger.info('License verify: Processing license verification', {
      requestId,
      teamId,
      licenseKey: body.licenseKey,
      hardwareId: body.hardwareIdentifier,
      ipAddress,
      country: geoData?.alpha2 || 'unknown',
      hasChallenge: !!body.challenge,
    });

    const result = await handleVerify({
      requestId,
      teamId,
      ipAddress,
      geoData,
      payload: body,
    });

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('License verify: Completed', {
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

    logger.error('License verify: Failed', {
      requestId,
      teamId,
      route: '/v1/client/teams/[teamId]/verification/verify',
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
