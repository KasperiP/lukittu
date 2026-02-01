import { createAuditLog } from '@/lib/logging/audit-log';
import { uploadFileToPrivateS3 } from '@/lib/providers/aws-s3';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { getIp } from '@/lib/utils/header-helpers';
import { getMainClassFromJar } from '@/lib/utils/java-helpers';
import { bytesToMb, bytesToSize } from '@/lib/utils/number-helpers';
import {
  CreateReleaseSchema,
  createReleaseSchema,
} from '@/lib/validation/releases/create-release-schema';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  attemptWebhookDelivery,
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  createReleasePayload,
  createWebhookEvents,
  generateMD5Hash,
  logger,
  prisma,
  regex,
  WebhookEventType,
} from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { after, NextRequest, NextResponse } from 'next/server';

const MAX_FILE_SIZE = 1024 * 1024 * 10; // 10MB

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const { teamId } = params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();

  try {
    logger.info('Dev API: Create release request started', {
      requestId,
      teamId,
      route: '/v1/dev/teams/[teamId]/releases',
      method: 'POST',
      userAgent,
      timestamp: requestTime.toISOString(),
      ipAddress,
    });

    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Invalid teamId provided for release creation', {
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

    const { team } = await verifyApiAuthorization(teamId);

    if (!team) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: API key authentication failed', {
        requestId,
        teamId,
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
      const key = `dev-releases-create:${ipAddress}`;
      const isLimited = await isRateLimited(key, 5, 300); // 5 requests per 5 minutes

      if (isLimited) {
        const responseTime = Date.now() - requestTime.getTime();

        logger.warn('Dev API: Rate limit exceeded for release creation', {
          requestId,
          teamId,
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
    const file = formData.get('file') as File | null;
    const data = formData.get('data') as string | null;

    if (!data) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Missing data field in release creation', {
        requestId,
        teamId,
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

    let body: CreateReleaseSchema;
    try {
      body = JSON.parse(data) as CreateReleaseSchema;
    } catch {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Invalid JSON in data field', {
        requestId,
        teamId,
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

    const validated = await createReleaseSchema().safeParseAsync(body);

    if (!validated.success) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Release creation validation failed', {
        requestId,
        teamId,
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
      setAsLatest,
      licenseIds,
      branchId,
    } = validated.data;

    // Validate file
    if (file && !(file instanceof File)) {
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

    // Check release count limit
    const releaseCount = await prisma.release.count({
      where: {
        productId,
        teamId: team.id,
      },
    });

    if (releaseCount >= team.limits.maxReleasesPerProduct) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Max releases per product reached',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.FORBIDDEN },
      );
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

      if (setAsLatest) {
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

    // Check version uniqueness per product+branch
    const existingRelease = await prisma.release.findFirst({
      where: {
        version,
        productId,
        branchId,
        teamId: team.id,
      },
    });

    if (existingRelease) {
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

      const release = await prisma.release.create({
        data: {
          metadata: {
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
          allowedLicenses: licenseIds.length
            ? {
                connect: licenseIds.map((id) => ({
                  id,
                })),
              }
            : undefined,
          file: file
            ? {
                create: {
                  key: fileKey!,
                  size: file.size,
                  checksum: checksum!,
                  name: file.name,
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
          details: 'Release created',
          timestamp: new Date(),
          valid: true,
        },
      };

      await createAuditLog({
        teamId: team.id,
        action: AuditLogAction.CREATE_RELEASE,
        targetId: release.id,
        targetType: AuditLogTargetType.RELEASE,
        responseBody: responseData,
        requestBody: body,
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.RELEASE_CREATED,
        teamId: team.id,
        payload: createReleasePayload(release),
        source: AuditLogSource.API_KEY,
        tx: prisma,
      });

      return responseData;
    });

    after(async () => {
      await attemptWebhookDelivery(webhookEventIds);
    });

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Release created successfully', {
      requestId,
      teamId,
      releaseId: response.data.id,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.CREATED,
    });

    return NextResponse.json(response, { status: HttpStatus.CREATED });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Create release failed', {
      requestId,
      teamId,
      route: '/v1/dev/teams/[teamId]/releases',
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
