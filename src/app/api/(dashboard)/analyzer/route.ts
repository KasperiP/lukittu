import prisma from '@/lib/database/prisma';
import { logger } from '@/lib/logging/logger';
import { decryptLicenseKey, generateHMAC } from '@/lib/security/crypto';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { getSession } from '@/lib/security/session';
import {
  getIp,
  getLanguage,
  getSelectedTeam,
} from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

const MAX_FILE_SIZE = 1024 * 1024 * 20; // 10MB

type IWatermarkServiceResponse = {
  watermarkFound: boolean;
  timestamp?: number;
  watermark?: string;
};

export interface IAnalyzerSuccessResponse {
  licenseKey: string;
  timestamp: number;
}

export type IAnalyzerResponse = IAnalyzerSuccessResponse | ErrorResponse;

export async function POST(request: NextRequest) {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        {
          message: t('validation.invalid_file_type'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          message: t('validation.file_too_large', {
            size: MAX_FILE_SIZE,
          }),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (fileExtension !== 'jar') {
      return NextResponse.json(
        {
          message: t('validation.invalid_file_type'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const ip = await getIp();
    if (ip) {
      const key = `analyzer:${ip}`;
      const isLimited = await isRateLimited(key, 5, 300); // 5 requests per 5 minutes

      if (isLimited) {
        return NextResponse.json(
          {
            message: t('validation.too_many_requests'),
          },
          { status: HttpStatus.TOO_MANY_REQUESTS },
        );
      }
    }

    const selectedTeam = await getSelectedTeam();
    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              id: selectedTeam,
              deletedAt: null,
            },
            include: {
              limits: true,
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (!session.user.teams.length) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const team = session.user.teams[0];
    if (!team.limits?.allowWatermarking) {
      return NextResponse.json(
        {
          message: t('validation.paid_subsciption_required'),
        },
        { status: HttpStatus.FORBIDDEN },
      );
    }

    const analyzeFormData = new FormData();
    analyzeFormData.append('file', file, 'file.jar');

    const ENCRYPTION_KEY = generateHMAC(selectedTeam).slice(0, 16);

    const analyzeResponse = await fetch(
      `${process.env.WATERMARK_SERVICE_BASE_URL}/api/watermark/detect`,
      {
        method: 'POST',
        body: analyzeFormData,
        headers: {
          'X-Encryption-Key': ENCRYPTION_KEY,
        },
      },
    );

    if (!analyzeResponse.ok) {
      logger.error('Error occurred while analyzing file', {
        statusCode: analyzeResponse.status,
        statusText: analyzeResponse.statusText,
      });

      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }

    const result = (await analyzeResponse.json()) as
      | IWatermarkServiceResponse
      | undefined;

    logger.info('Watermark service response', result);

    const watermark = result?.watermark;
    if (watermark) {
      const [teamId, licenseKeyLookup] = watermark.split(':');

      if (teamId !== selectedTeam) {
        return NextResponse.json({
          watermarkFound: false,
          timestamp: null,
          watermark: null,
        });
      }

      const licenseKey = await prisma.license.findUnique({
        where: {
          teamId_licenseKeyLookup: {
            teamId,
            licenseKeyLookup,
          },
        },
      });

      if (licenseKey) {
        return NextResponse.json({
          licenseKey: decryptLicenseKey(licenseKey.licenseKey),
          timestamp: result.timestamp,
        });
      }
    }

    return NextResponse.json({
      licenseKey: null,
      timestamp: result?.timestamp,
    });
  } catch (error) {
    logger.error("Error occurred in 'analyzer' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
