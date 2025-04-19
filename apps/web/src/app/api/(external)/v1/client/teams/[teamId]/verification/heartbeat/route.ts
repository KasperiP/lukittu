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
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
): Promise<NextResponse<IExternalVerificationResponse>> {
  const params = await props.params;
  const requestTime = new Date();
  const teamId = params.teamId;

  const loggedResponseBase = {
    body: null,
    request,
    requestTime,
    type: RequestType.HEARTBEAT,
  };

  const geoData = await getCloudflareVisitorData();
  const ipAddress = await getIp();

  try {
    const body = (await request.json()) as LicenseHeartbeatSchema;

    const result = await handleHeartbeat({
      teamId,
      ipAddress,
      geoData,
      payload: body,
    });

    return loggedResponse({
      ...loggedResponseBase,
      ...result,
    });
  } catch (error) {
    logger.error(
      "Error occurred in '(external)/v1/client/teams/[teamId]/verification/heartbeat' route",
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
