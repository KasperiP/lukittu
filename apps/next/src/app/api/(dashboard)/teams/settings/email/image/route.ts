import prisma from '@/lib/database/prisma';
import { createAuditLog } from '@/lib/logging/audit-log';
import { logger } from '@/lib/logging/logger';
import {
  deleteFileFromPublicS3,
  uploadFileToPublicS3,
} from '@/lib/providers/aws-s3';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { getSession } from '@/lib/security/session';
import {
  getIp,
  getLanguage,
  getSelectedTeam,
} from '@/lib/utils/header-helpers';
import { bytesToSize } from '@/lib/utils/number-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { AuditLogAction, AuditLogTargetType } from '@lukittu/prisma';
import { randomUUID } from 'crypto';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_DIMENSION = 300;

export type ITeamsEmailImageSetSuccessResponse = {
  url: string;
};

export type ITeamsEmailImageSetResponse =
  | ITeamsEmailImageSetSuccessResponse
  | ErrorResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ITeamsEmailImageSetResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || !(file instanceof File)) {
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
            size: bytesToSize(MAX_FILE_SIZE),
          }),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          message: t('validation.invalid_file_type'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const ip = await getIp();
    if (ip) {
      const key = `team-email-image:${ip}`;
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
              settings: true,
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

    if (!team.limits?.allowCustomEmails) {
      return NextResponse.json(
        {
          message: t('validation.paid_subsciption_required'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const fileBuffer = await file.arrayBuffer();
    let processedImageBuffer: Buffer;
    try {
      const metadata = await sharp(Buffer.from(fileBuffer)).metadata();
      const aspectRatio = (metadata.width || 0) / (metadata.height || 1);
      const targetWidth = Math.min(
        4 * MAX_IMAGE_DIMENSION,
        Math.round(aspectRatio * MAX_IMAGE_DIMENSION),
      );

      processedImageBuffer = await sharp(Buffer.from(fileBuffer))
        .resize(targetWidth, MAX_IMAGE_DIMENSION, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          position: 'left',
        })
        .png({ quality: 80 })
        .toBuffer();
    } catch (error) {
      logger.error('Error occurred while resizing image', error);
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }

    if (team.settings?.emailImageUrl) {
      const imageUrlParts = team.settings.emailImageUrl.split('/');
      const fileKey = `team-emails/${imageUrlParts[imageUrlParts.length - 1]}`;
      await deleteFileFromPublicS3(
        process.env.PUBLIC_OBJECT_STORAGE_BUCKET_NAME!,
        fileKey,
      );
    }

    const imageUuid = randomUUID();

    const fileKey = `team-emails/${imageUuid}.${file.type.split('/')[1]}`;
    await uploadFileToPublicS3(
      process.env.PUBLIC_OBJECT_STORAGE_BUCKET_NAME!,
      fileKey,
      processedImageBuffer,
      file.type,
    );

    const imageUrl = `${process.env.PUBLIC_OBJECT_STORAGE_BASE_URL}/${fileKey}`;

    await prisma.settings.update({
      where: {
        teamId: team.id,
      },
      data: {
        emailImageUrl: imageUrl,
      },
    });

    const response = {
      url: imageUrl,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: team.id,
      action: AuditLogAction.UPDATE_EMAIL_PICTURE,
      targetId: team.id,
      targetType: AuditLogTargetType.TEAM,
      requestBody: null,
      responseBody: response,
    });

    return NextResponse.json(response, { status: HttpStatus.OK });
  } catch (error) {
    logger.error("Error occurred in 'teams/settings/email/image' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

export type ITeamsEmailImageDeleteSuccessResponse = {
  success: boolean;
};

export type ITeamsEmailImageDeleteResponse =
  | ITeamsEmailImageDeleteSuccessResponse
  | ErrorResponse;

export async function DELETE(request: NextRequest) {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
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
              settings: true,
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

    if (!team.settings?.emailImageUrl) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const imageUrlParts = team.settings.emailImageUrl.split('/');
    const fileKey = `team-emails/${imageUrlParts[imageUrlParts.length - 1]}`;
    await deleteFileFromPublicS3(
      process.env.PUBLIC_OBJECT_STORAGE_BUCKET_NAME!,
      fileKey,
    );

    await prisma.settings.update({
      where: {
        id: team.settings.id,
      },
      data: {
        emailImageUrl: null,
      },
    });

    const response = {
      success: true,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: team.id,
      action: AuditLogAction.DELETE_EMAIL_PICTURE,
      targetId: team.id,
      targetType: AuditLogTargetType.TEAM,
      requestBody: null,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'teams/settings/email/image' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
