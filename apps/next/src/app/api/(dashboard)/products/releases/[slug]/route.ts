import { regex } from '@/lib/constants/regex';
import prisma from '@/lib/database/prisma';
import { createAuditLog } from '@/lib/logging/audit-log';
import { logger } from '@/lib/logging/logger';
import {
  deleteFileFromPrivateS3,
  uploadFileToPrivateS3,
} from '@/lib/providers/aws-s3';
import { generateMD5Hash } from '@/lib/security/crypto';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { getSession } from '@/lib/security/session';
import {
  getIp,
  getLanguage,
  getSelectedTeam,
} from '@/lib/utils/header-helpers';
import { getMainClassFromJar } from '@/lib/utils/java-helpers';
import { bytesToMb, bytesToSize } from '@/lib/utils/number-helpers';
import {
  SetReleaseSchema,
  setReleaseSchema,
} from '@/lib/validation/products/set-release-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { AuditLogAction, AuditLogTargetType, Release } from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

const MAX_FILE_SIZE = 1024 * 1024 * 10; // 10 MB

export type IProductsReleasesUpdateSuccessResponse = {
  release: Release;
};

export type IProductsReleasesUpdateResponse =
  | IProductsReleasesUpdateSuccessResponse
  | ErrorResponse;

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
) {
  const t = await getTranslations({ locale: await getLanguage() });
  const params = await props.params;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const data = formData.get('data') as string | null;

    const releaseId = params.slug;

    if (!releaseId || !regex.uuidV4.test(releaseId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (!data) {
      return NextResponse.json(
        { message: t('validation.bad_request') },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const body = JSON.parse(data) as SetReleaseSchema;
    const validated = await setReleaseSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const {
      metadata,
      productId,
      status,
      version,
      keepExistingFile,
      setAsLatest,
      licenseIds,
    } = validated.data;

    if (file) {
      if (!(file instanceof File)) {
        return NextResponse.json(
          { message: t('validation.bad_request') },
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
    }

    const ip = await getIp();
    if (ip) {
      const key = `releases-update:${ip}`;
      const isLimited = await isRateLimited(key, 5, 300);
      if (isLimited) {
        return NextResponse.json(
          { message: t('validation.too_many_requests') },
          { status: HttpStatus.TOO_MANY_REQUESTS },
        );
      }
    }

    const selectedTeam = await getSelectedTeam();
    if (!selectedTeam) {
      return NextResponse.json(
        { message: t('validation.team_not_found') },
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
              releases: true,
              products: {
                where: { id: validated.data.productId },
              },
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

    if (!team.limits) {
      // Should never happen
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (file && !team.limits.allowClassloader) {
      return NextResponse.json(
        {
          message: t('validation.paid_subsciption_required'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (!team.products.length) {
      return NextResponse.json(
        {
          message: t('validation.product_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const existingRelease = team.releases.find((r) => r.id === releaseId);

    if (!existingRelease) {
      return NextResponse.json(
        { message: t('validation.release_not_found') },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (
      team.releases.find(
        (release) =>
          release.version === version &&
          release.productId === productId &&
          release.id !== releaseId,
      )
    ) {
      return NextResponse.json(
        {
          message: t('validation.release_exists'),
          field: 'version',
        },
        { status: HttpStatus.CONFLICT },
      );
    }

    if (licenseIds.length) {
      const licenses = await prisma.license.findMany({
        where: {
          id: {
            in: licenseIds,
          },
        },
      });

      if (licenses.length !== licenseIds.length) {
        return NextResponse.json(
          {
            message: t('validation.license_not_found'),
          },
          { status: HttpStatus.NOT_FOUND },
        );
      }

      if (setAsLatest || (existingRelease.latest && status === 'PUBLISHED')) {
        return NextResponse.json(
          {
            message: t('validation.latest_release_not_allowed_with_licenses'),
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }
    }

    await prisma.$transaction(async (prisma) => {
      const existingReleaseFile = await prisma.releaseFile.findUnique({
        where: { releaseId },
      });

      const newFileUploaded = file && existingReleaseFile;
      const fileDeleted = !file && existingReleaseFile && !keepExistingFile;
      if (newFileUploaded || fileDeleted) {
        await deleteFileFromPrivateS3(
          process.env.PRIVATE_OBJECT_STORAGE_BUCKET_NAME!,
          existingReleaseFile.key,
        );

        await prisma.releaseFile.delete({
          where: { releaseId },
        });
      }
    });

    let fileKey: string | null = null;
    let checksum: string | null = null;
    let mainClassName: string | null = null;
    if (file) {
      const teamReleases = await prisma.release.findMany({
        where: {
          teamId: team.id,
        },
        include: {
          file: true,
        },
      });

      const totalStorageUsed = teamReleases.reduce(
        (acc, release) => acc + (release.file?.size || 0),
        0,
      );

      const maxStorage = team.limits.maxStorage || 0; // In MB
      const totalStorageUsedMb = bytesToMb(totalStorageUsed);
      const uploadeReleaseSizeMb = bytesToMb(file.size);
      const newTotalStorageUsedMb = totalStorageUsedMb + uploadeReleaseSizeMb;

      if (newTotalStorageUsedMb > maxStorage) {
        return NextResponse.json(
          {
            message: t('validation.storage_limit_reached', {
              maxStorage,
            }),
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }

      const generatedChecksum = await generateMD5Hash(file);

      if (!generatedChecksum) {
        return NextResponse.json(
          {
            message: t('general.server_error'),
          },
          { status: HttpStatus.INTERNAL_SERVER_ERROR },
        );
      }

      checksum = generatedChecksum;

      const fileExtension = file.name.split('.').pop();

      if (!fileExtension || !fileExtension.length) {
        return NextResponse.json(
          {
            message: t('validation.file_extension_not_found'),
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }

      if (fileExtension === 'jar') {
        const foundMainClassName = await getMainClassFromJar(file);
        if (!foundMainClassName) {
          return NextResponse.json(
            {
              message: t('validation.main_class_not_found'),
            },
            { status: HttpStatus.BAD_REQUEST },
          );
        }

        mainClassName = foundMainClassName;
      }

      fileKey = `releases/${team.id}/${productId}-${version}.${fileExtension}`;
      const fileStream = file.stream();
      await uploadFileToPrivateS3(
        process.env.PRIVATE_OBJECT_STORAGE_BUCKET_NAME!,
        fileKey,
        fileStream,
        file.type,
      );
    }

    const release = await prisma.$transaction(async (prisma) => {
      const isPublished = status === 'PUBLISHED';

      if (isPublished && setAsLatest) {
        await prisma.release.updateMany({
          where: {
            productId,
          },
          data: {
            latest: false,
          },
        });
      }

      const release = await prisma.release.update({
        where: { id: releaseId },
        data: {
          metadata: {
            deleteMany: {},
            createMany: {
              data: metadata.map((m) => ({
                ...m,
                teamId: team.id,
              })),
            },
          },
          productId,
          status,
          version,
          teamId: team.id,
          latest: Boolean(setAsLatest && isPublished),
          allowedLicenses: {
            set: licenseIds.map((id) => ({ id })),
          },
          file: file
            ? {
                create: {
                  key: fileKey!,
                  checksum: checksum!,
                  name: file.name,
                  size: file.size,
                  mainClassName,
                },
              }
            : undefined,
        },
      });

      return release;
    });

    const response = {
      release,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.UPDATE_RELEASE,
      targetId: release.id,
      targetType: AuditLogTargetType.RELEASE,
      responseBody: response,
      requestBody: body,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      "Error occurred in PUT '/api/products/releases/[slug]' route",
      error,
    );
    return NextResponse.json(
      { message: t('general.server_error') },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

export type IProductsReleasesDeleteSuccessResponse = {
  success: boolean;
};

export type IProductsReleasesDeleteResponse =
  | IProductsReleasesDeleteSuccessResponse
  | ErrorResponse;

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<IProductsReleasesDeleteResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const releaseId = params.slug;

    if (!releaseId || !regex.uuidV4.test(releaseId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
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
              deletedAt: null,
              id: selectedTeam,
            },
            include: {
              releases: {
                where: {
                  id: releaseId,
                },
                include: {
                  file: true,
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
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

    if (!team.releases.length) {
      return NextResponse.json(
        {
          message: t('validation.customer_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const release = team.releases[0];

    await prisma.release.delete({
      where: {
        id: releaseId,
      },
    });

    if (release.file) {
      await deleteFileFromPrivateS3(
        process.env.PRIVATE_OBJECT_STORAGE_BUCKET_NAME!,
        release.file.key,
      );
    }

    const response = {
      success: true,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: team.id,
      action: AuditLogAction.DELETE_RELEASE,
      targetId: releaseId,
      targetType: AuditLogTargetType.RELEASE,
      requestBody: null,
      responseBody: response,
    });

    return NextResponse.json(response, { status: HttpStatus.OK });
  } catch (error) {
    logger.error("Error occurred in 'products/releases/[slug]' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
