import { loggedResponse, logRequest } from '@/lib/logging/request-log';
import { getCloudflareVisitorData } from '@/lib/providers/cloudflare';
import { getIp } from '@/lib/utils/header-helpers';
import { handleClassloader } from '@/lib/verification/classloader';
import { HttpStatus } from '@/types/http-status';
import { logger, RequestStatus, RequestType } from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
) {
  const requestTime = new Date();
  const params = await props.params;
  const teamId = params.teamId;
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';

  const ipAddress = await getIp();
  const geoData = await getCloudflareVisitorData();

  logger.info('License classloader: Request started', {
    requestId,
    teamId,
    route: '/v1/client/teams/[teamId]/verification/classloader',
    method: 'GET',
    userAgent,
    timestamp: requestTime.toISOString(),
  });

  const loggedResponseBase = {
    body: null,
    request,
    requestTime,
    type: RequestType.DOWNLOAD,
    query: null,
  };

  try {
    const searchParams = request.nextUrl.searchParams;

    /**
     * @deprecated use hardwareIdentifier. Only for backward compatibility.
     */
    const legacyDeviceIdentifier = searchParams.get('deviceIdentifier');

    const payload = {
      licenseKey: searchParams.get('licenseKey') || undefined,
      customerId: searchParams.get('customerId') || undefined,
      productId: searchParams.get('productId') || undefined,
      version: searchParams.get('version') || undefined,
      sessionKey: searchParams.get('sessionKey') || undefined,
      hardwareIdentifier:
        legacyDeviceIdentifier ||
        searchParams.get('hardwareIdentifier') ||
        undefined,
      branch: searchParams.get('branch') || undefined,
    };

    logger.info('License classloader: Processing classloader download', {
      requestId,
      teamId,
      licenseKey: payload.licenseKey,
      hardwareId: payload.hardwareIdentifier,
      productId: payload.productId,
      version: payload.version,
      branch: payload.branch,
      hasSessionKey: !!payload.sessionKey,
      ipAddress,
      country: geoData?.alpha2 || 'unknown',
    });

    const result = await handleClassloader({
      requestId,
      teamId,
      ipAddress,
      geoData,
      payload,
    });

    if ('stream' in result) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.info('License classloader: Completed - streaming file', {
        requestId,
        teamId,
        status: RequestStatus.VALID,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.OK,
        contentLength: result.headers?.['X-File-Size'] || 'unknown',
      });

      // Log successful request
      logRequest({
        hardwareIdentifier: payload.hardwareIdentifier,
        pathname: request.nextUrl.pathname,
        requestBody: null,
        responseBody: null,
        requestQuery: payload,
        requestTime,
        status: RequestStatus.VALID,
        customerId: payload.customerId,
        productId: payload.productId,
        licenseKeyLookup: result.loggingData?.licenseKeyLookup,
        teamId,
        type: RequestType.DOWNLOAD,
        statusCode: HttpStatus.OK,
        method: request.method,
        releaseId: result.loggingData?.releaseId,
        releaseFileId: result.loggingData?.releaseFileId,
      });

      return new Response(result.stream, {
        headers: result.headers,
      });
    }

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('License classloader: Completed', {
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

    logger.error('License classloader: Failed', {
      requestId,
      teamId,
      route: '/v1/client/teams/[teamId]/verification/classloader',
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
