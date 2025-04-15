import prisma from '@/lib/database/prisma';
import { logger } from '@/lib/logging/logger';
import {
  deleteFileFromPublicS3,
  uploadFileToPublicS3,
} from '@/lib/providers/aws-s3';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { getSession } from '@/lib/security/session';
import { getIp, getLanguage } from '@/lib/utils/header-helpers';
import { bytesToSize } from '@/lib/utils/number-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { randomUUID } from 'crypto';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_DIMENSION = 600; // pixels

export type IUsersImageSetSuccessResponse = {
  url: string;
};

export type IUsersImageSetResponse =
  | IUsersImageSetSuccessResponse
  | ErrorResponse;

export async function POST(request: NextRequest) {
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
      const key = `user-image:${ip}`;
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

    const session = await getSession({ user: true });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    const user = session.user;

    const fileBuffer = await file.arrayBuffer();
    let processedImageBuffer: Buffer;
    try {
      processedImageBuffer = await sharp(Buffer.from(fileBuffer))
        .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
          fit: 'cover',
          position: 'center',
        })
        .webp({ quality: 80 })
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

    if (user.imageUrl) {
      const imageUrlParts = user.imageUrl.split('/');
      const fileKey = `users/${imageUrlParts[imageUrlParts.length - 1]}`;
      await deleteFileFromPublicS3(
        process.env.PUBLIC_OBJECT_STORAGE_BUCKET_NAME!,
        fileKey,
      );
    }

    const imageUuid = randomUUID();

    const fileKey = `users/${imageUuid}.${file.type.split('/')[1]}`;

    await uploadFileToPublicS3(
      process.env.PUBLIC_OBJECT_STORAGE_BUCKET_NAME!,
      fileKey,
      processedImageBuffer,
      file.type,
    );

    const imageUrl = `${process.env.PUBLIC_OBJECT_STORAGE_BASE_URL}/${fileKey}`;

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        imageUrl,
      },
    });

    return NextResponse.json(
      {
        url: imageUrl,
      },
      { status: HttpStatus.OK },
    );
  } catch (error) {
    logger.error("Error occurred in 'users/image' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

export type IUsersImageDeleteSuccessResponse = {
  success: boolean;
};

export type IUsersImageDeleteResponse =
  | ErrorResponse
  | IUsersImageDeleteSuccessResponse;

export async function DELETE(
  request: NextRequest,
): Promise<NextResponse<IUsersImageDeleteResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const session = await getSession({ user: true });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    const user = session.user;

    if (!user.imageUrl) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const imageUrlParts = user.imageUrl.split('/');
    const fileKey = `users/${imageUrlParts[imageUrlParts.length - 1]}`;

    await deleteFileFromPublicS3(
      process.env.PUBLIC_OBJECT_STORAGE_BUCKET_NAME!,
      fileKey,
    );

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        imageUrl: null,
      },
    });

    return NextResponse.json(
      {
        success: true,
      },
      { status: HttpStatus.OK },
    );
  } catch (error) {
    logger.error("Error occurred in 'users/image' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
