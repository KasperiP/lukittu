import { createAuditLog } from '@/lib/logging/audit-log';
import {
  deleteFileFromPrivateS3,
  uploadFileToPrivateS3,
} from '@/lib/providers/aws-s3';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { getIp } from '@/lib/utils/header-helpers';
import { getMainClassFromJar } from '@/lib/utils/java-helpers';
import { bytesToMb, bytesToSize } from '@/lib/utils/number-helpers';
import {
  UpdateReleaseSchema,
  updateReleaseSchema,
} from '@/lib/validation/releases/update-release-schema';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  attemptWebhookDelivery,
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  createWebhookEvents,
  generateMD5Hash,
  logger,
  prisma,
  regex,
  updateReleasePayload,
  WebhookEventType,
} from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { after, NextRequest, NextResponse } from 'next/server';

const MAX_FILE_SIZE = 1024 * 1024 * 10; // 10MB

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ teamId: string; releaseId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const { teamId, releaseId } = params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();

  try {
    logger.info('Dev API: Update release request started', {
      requestId,
      teamId,
      releaseId,
      route: '/v1/dev/teams/[teamId]/releases/[releaseId]',
      method: 'PUT',
      userAgent,
      timestamp: requestTime.toISOString(),
      ipAddress,
    });

    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Invalid teamId provided for release update', {
        requestId,
        providedTeamId: teamId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid teamId',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (!releaseId || !regex.uuidV4.test(releaseId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Invalid releaseId provided for release update', {
        requestId,
        teamId,
        providedReleaseId: releaseId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid releaseId',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { team } = await verifyApiAuthorization(teamId);

    if (!team) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: API key authentication failed for release update', {
        requestId,
        teamId,
        releaseId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.UNAUTHORIZED,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid API key',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (ipAddress) {
      const key = `dev-releases-update:${ipAddress}`;
      const isLimited = await isRateLimited(key, 5, 300); // 5 requests per 5 minutes

      if (isLimited) {
        const responseTime = Date.now() - requestTime.getTime();

        logger.warn('Dev API: Rate limit exceeded for release update', {
          requestId,
          teamId,
          releaseId,
          responseTimeMs: responseTime,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          ipAddress,
          userAgent,
        });

        return NextResponse.json(
          {
            data: null,
            result: {
              details: 'Too many requests',
              timestamp: new Date(),
              valid: false,
            },
          },
          { status: HttpStatus.TOO_MANY_REQUESTS },
        );
      }
    }

    const formData = await request.formData();
    const fileEntry = formData.get('file');
    const dataEntry = formData.get('data');

    if (typeof dataEntry !== 'string') {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Missing data field in release update', {
        requestId,
        teamId,
        releaseId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Missing data field',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (fileEntry !== null && !(fileEntry instanceof File)) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid file',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const file = fileEntry;

    let body: UpdateReleaseSchema;
    try {
      body = JSON.parse(dataEntry) as UpdateReleaseSchema;
    } catch {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Invalid JSON in data field for release update', {
        requestId,
        teamId,
        releaseId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid JSON in data field',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const validated = await updateReleaseSchema().safeParseAsync(body);

    if (!validated.success) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Release update validation failed', {
        requestId,
        teamId,
        releaseId,
        validationErrors: validated.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: validated.error.errors.map((error) => ({
            message: error.message,
            path: error.path,
          })),
          result: {
            details: 'Invalid request body',
            timestamp: new Date(),
            valid: false,
          },
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
      branchId,
    } = validated.data;

    if (file && file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: `File too large. Maximum size is ${bytesToSize(MAX_FILE_SIZE)}`,
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (file && !team.limits.allowClassloader) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'File uploads require a paid subscription',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Validate product exists and belongs to team
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        teamId: team.id,
      },
      include: {
        branches: branchId
          ? {
              where: {
                id: branchId,
              },
            }
          : undefined,
      },
    });

    if (!product) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Product not found',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    // Validate release exists and belongs to team
    const existingRelease = await prisma.release.findFirst({
      where: {
        id: releaseId,
        teamId: team.id,
      },
    });

    if (!existingRelease) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Release not found',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    // Check version uniqueness per product+branch (excluding current release)
    const duplicateRelease = await prisma.release.findFirst({
      where: {
        version,
        productId,
        branchId,
        teamId: team.id,
        NOT: { id: releaseId },
      },
    });

    if (duplicateRelease) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details:
              'A release with this version already exists for this product and branch',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.CONFLICT },
      );
    }

    // Validate branch
    if (branchId) {
      const branch = product.branches?.find((b) => b.id === branchId);

      if (!branch) {
        return NextResponse.json(
          {
            data: null,
            result: {
              details: 'Branch not found',
              timestamp: new Date(),
              valid: false,
            },
          },
          { status: HttpStatus.NOT_FOUND },
        );
      }
    }

    // Validate license IDs
    if (licenseIds.length) {
      const licenses = await prisma.license.findMany({
        where: {
          id: {
            in: licenseIds,
          },
          teamId: team.id,
        },
      });

      if (licenses.length !== licenseIds.length) {
        return NextResponse.json(
          {
            data: null,
            result: {
              details: 'One or more license IDs not found',
              timestamp: new Date(),
              valid: false,
            },
          },
          { status: HttpStatus.NOT_FOUND },
        );
      }

      if (setAsLatest || (existingRelease.latest && status === 'PUBLISHED')) {
        return NextResponse.json(
          {
            data: null,
            result: {
              details:
                'Cannot set as latest release when license IDs are provided',
              timestamp: new Date(),
              valid: false,
            },
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }
    }

    // Handle existing file deletion
    await prisma.$transaction(
      async (prisma) => {
        const existingReleaseFile = await prisma.releaseFile.findUnique({
          where: { releaseId, release: { teamId: team.id } },
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
      },
      {
        timeout: 20000,
      },
    );

    // File processing
    let fileKey: string | null = null;
    let checksum: string | null = null;
    let mainClassName: string | null = null;

    if (file) {
      // Storage limit check
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
      const uploadedReleaseSizeMb = bytesToMb(file.size);

      if (totalStorageUsedMb + uploadedReleaseSizeMb > maxStorage) {
        return NextResponse.json(
          {
            data: null,
            result: {
              details: 'Storage limit reached',
              timestamp: new Date(),
              valid: false,
            },
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }

      const generatedChecksum = await generateMD5Hash(file);

      if (!generatedChecksum) {
        return NextResponse.json(
          {
            data: null,
            result: {
              details: 'Failed to generate file checksum',
              timestamp: new Date(),
              valid: false,
            },
          },
          { status: HttpStatus.INTERNAL_SERVER_ERROR },
        );
      }

      checksum = generatedChecksum;

      const fileExtension = file.name.split('.').pop();

      if (!fileExtension || !fileExtension.length) {
        return NextResponse.json(
          {
            data: null,
            result: {
              details: 'File must have an extension',
              timestamp: new Date(),
              valid: false,
            },
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }

      if (fileExtension === 'jar') {
        const foundMainClassName = await getMainClassFromJar(file);
        if (!foundMainClassName) {
          return NextResponse.json(
            {
              data: null,
              result: {
                details: 'Main class not found in JAR file',
                timestamp: new Date(),
                valid: false,
              },
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

    let webhookEventIds: string[] = [];

    const response = await prisma.$transaction(async (prisma) => {
      const isPublished = status === 'PUBLISHED';

      if (isPublished && setAsLatest) {
        await prisma.release.updateMany({
          where: {
            productId,
            branchId,
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
          branchId,
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
        include: {
          metadata: true,
          product: true,
          file: true,
          branch: true,
        },
      });

      const responseData: IExternalDevResponse = {
        data: {
          id: release.id,
          version: release.version,
          status: release.status,
          latest: release.latest,
          productId: release.productId,
          branchId: release.branchId,
          teamId: release.teamId,
          createdAt: release.createdAt,
          updatedAt: release.updatedAt,
          metadata: release.metadata,
          product: release.product,
          branch: release.branch,
          file: release.file,
        },
        result: {
          details: 'Release updated',
          timestamp: new Date(),
          valid: true,
        },
      };

      await createAuditLog({
        teamId: team.id,
        action: AuditLogAction.UPDATE_RELEASE,
        targetId: release.id,
        targetType: AuditLogTargetType.RELEASE,
        responseBody: responseData,
        requestBody: body,
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.RELEASE_UPDATED,
        teamId: team.id,
        payload: updateReleasePayload(release),
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      return responseData;
    });

    after(async () => {
      await attemptWebhookDelivery(webhookEventIds);
    });

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Release updated successfully', {
      requestId,
      teamId,
      releaseId: response.data.id,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(response, { status: HttpStatus.OK });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Update release failed', {
      requestId,
      teamId,
      releaseId,
      route: '/v1/dev/teams/[teamId]/releases/[releaseId]',
      error: error instanceof Error ? error.message : String(error),
      errorType: error?.constructor?.name || 'Unknown',
      responseTimeMs: responseTime,
      ipAddress,
      userAgent,
    });

    return NextResponse.json(
      {
        data: null,
        result: {
          details: 'Internal server error',
          timestamp: new Date(),
          valid: false,
        },
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
