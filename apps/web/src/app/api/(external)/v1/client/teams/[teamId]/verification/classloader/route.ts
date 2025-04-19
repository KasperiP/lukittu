import { loggedResponse, logRequest } from '@/lib/logging/request-log';
import { getCloudflareVisitorData } from '@/lib/providers/cloudflare';
import { getIp } from '@/lib/utils/header-helpers';
import { handleClassloader } from '@/lib/verification/classloader';
import { HttpStatus } from '@/types/http-status';
import { logger, RequestStatus, RequestType } from '@lukittu/shared';
import { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
) {
  const requestTime = new Date();
  const params = await props.params;
  const teamId = params.teamId;

  const loggedResponseBase = {
    body: null,
    request,
    requestTime,
    type: RequestType.DOWNLOAD,
    query: null,
  };

  try {
    const searchParams = request.nextUrl.searchParams;
    const payload = {
      licenseKey: searchParams.get('licenseKey') || undefined,
      customerId: searchParams.get('customerId') || undefined,
      productId: searchParams.get('productId') || undefined,
      version: searchParams.get('version') || undefined,
      sessionKey: searchParams.get('sessionKey') || undefined,
      deviceIdentifier: searchParams.get('deviceIdentifier') || undefined,
    };

    const ipAddress = await getIp();
    const geoData = await getCloudflareVisitorData();

    const result = await handleClassloader({
      teamId,
      ipAddress,
      geoData,
      payload,
    });

    if ('stream' in result) {
      // Log successful request
      logRequest({
        deviceIdentifier: payload.deviceIdentifier,
        pathname: request.nextUrl.pathname,
        requestBody: null,
        responseBody: null,
        requestQuery: payload,
        requestTime,
        status: RequestStatus.VALID,
        customerId: payload.customerId,
        productId: payload.productId,
        licenseKeyLookup: undefined,
        teamId,
        type: RequestType.DOWNLOAD,
        statusCode: HttpStatus.OK,
        method: request.method,
        releaseId: undefined,
        releaseFileId: undefined,
      });

      return new Response(result.stream, {
        headers: result.headers,
      });
    }

    return loggedResponse({
      ...loggedResponseBase,
      ...result,
    });
  } catch (error) {
    logger.error(
      "Error occurred in '(external)/v1/client/teams/[teamid]/verification/classloader' route",
      error,
    );

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
