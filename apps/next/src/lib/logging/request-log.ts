import { HttpStatus } from '@/types/http-status';
import { RequestMethod, RequestStatus, RequestType } from '@lukittu/prisma';
import { NextRequest, NextResponse } from 'next/server';
import 'server-only';
import prisma from '../database/prisma';
import { getCloudflareVisitorData } from '../providers/cloudflare';
import { iso2toIso3 } from '../utils/country-helpers';
import { getIp, getOrigin, getUserAgent } from '../utils/header-helpers';
import { logger } from './logger';

interface LogRequestProps {
  pathname: string;
  requestBody: any;
  responseBody: any;
  requestQuery?: any;
  requestTime: Date;
  statusCode: number;
  status: RequestStatus;
  customerId?: string;
  productId?: string;
  licenseKeyLookup?: string;
  teamId?: string;
  method: string;
  deviceIdentifier?: string;
  releaseId?: string;
  type: RequestType;
  releaseFileId?: string;
}

export async function logRequest({
  requestBody,
  responseBody,
  requestTime,
  status,
  statusCode,
  customerId,
  productId,
  licenseKeyLookup,
  requestQuery,
  deviceIdentifier,
  teamId,
  method,
  pathname,
  type,
  releaseFileId,
  releaseId,
}: LogRequestProps) {
  try {
    const origin = await getOrigin();
    const ipAddress = await getIp();
    const geoData = await getCloudflareVisitorData();
    const longitude = geoData?.long || null;
    const latitude = geoData?.lat || null;
    const hasBothLongitudeAndLatitude = longitude && latitude;
    const countryAlpha3: string | null = geoData?.alpha2
      ? iso2toIso3(geoData.alpha2!)
      : null;

    await prisma.$transaction(async (tx) => {
      if (licenseKeyLookup && teamId) {
        await tx.license.update({
          where: {
            teamId_licenseKeyLookup: {
              teamId,
              licenseKeyLookup,
            },
          },
          data: {
            lastActiveAt: new Date(),
          },
        });
      }

      await tx.requestLog.create({
        data: {
          version: process.env.version!,
          method: method.toUpperCase() as RequestMethod,
          path: pathname,
          userAgent: await getUserAgent(),
          origin,
          statusCode,
          longitude: hasBothLongitudeAndLatitude ? longitude : null,
          latitude: hasBothLongitudeAndLatitude ? latitude : null,
          responseTime: new Date().getTime() - requestTime.getTime(),
          status,
          requestBody,
          requestQuery,
          responseBody,
          type,
          deviceIdentifier,
          ipAddress,
          release: releaseId ? { connect: { id: releaseId } } : undefined,
          releaseFile: releaseFileId
            ? { connect: { id: releaseFileId } }
            : undefined,
          country: countryAlpha3,
          team: { connect: { id: teamId } },
          customer: customerId ? { connect: { id: customerId } } : undefined,
          product: productId ? { connect: { id: productId } } : undefined,
          license:
            licenseKeyLookup && teamId
              ? {
                  connect: {
                    teamId_licenseKeyLookup: {
                      teamId,
                      licenseKeyLookup,
                    },
                  },
                }
              : undefined,
        },
      });
    });
  } catch (error) {
    logger.error("Error logging request in 'license/verify' route", error);
  }
}

interface HandleLoggedRequestResponse {
  body: any;
  request: NextRequest;
  requestTime: Date;
  status: RequestStatus;
  deviceIdentifier?: string;
  query?: any;
  response: {
    data: any;
    result: {
      timestamp: Date;
      valid: boolean;
      details: string;
      challengeResponse?: string;
    };
  };
  httpStatus: HttpStatus;
  customerId?: string;
  productId?: string;
  type: RequestType;
  teamId?: string;
  releaseId?: string;
  releaseFileId?: string;
  licenseKeyLookup?: string;
}

export interface IExternalVerificationResponse {
  data: any;
  result: {
    timestamp: Date;
    valid: boolean;
    details: string;
    code: RequestStatus;
    challengeResponse?: string;
  };
}

export async function loggedResponse({
  body,
  query,
  request,
  requestTime,
  status,
  teamId,
  response,
  httpStatus,
  customerId,
  productId,
  licenseKeyLookup,
  deviceIdentifier,
  releaseFileId,
  releaseId,
  type,
}: HandleLoggedRequestResponse): Promise<
  NextResponse<IExternalVerificationResponse>
> {
  const responseBody = {
    data: response.data,
    result: {
      timestamp: response.result.timestamp,
      valid: response.result.valid,
      details: response.result.details,
      code: status,
      challengeResponse: response.result.challengeResponse,
    },
  };

  if (teamId) {
    logRequest({
      deviceIdentifier,
      pathname: request.nextUrl.pathname,
      requestBody: body,
      responseBody,
      requestTime,
      status,
      customerId,
      productId,
      licenseKeyLookup,
      teamId,
      requestQuery: query,
      statusCode: httpStatus,
      method: request.method,
      releaseFileId,
      releaseId,
      type,
    });
  }

  return NextResponse.json(responseBody, { status: httpStatus });
}
