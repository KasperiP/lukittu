import { createAuditLog } from '@/lib/logging/audit-log';
import { uploadFileToPrivateS3 } from '@/lib/providers/aws-s3';
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
import {
  AuditLogAction,
  AuditLogTargetType,
  decryptLicenseKey,
  generateMD5Hash,
  License,
  logger,
  Metadata,
  prisma,
  Prisma,
  Product,
  regex,
  Release,
  ReleaseFile,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

const MAX_FILE_SIZE = 1024 * 1024 * 10; // 10MB

export type IProductsReleasesCreateSuccessResponse = {
  release: Release;
};

export type IProductsReleasesCreateResponse =
  | IProductsReleasesCreateSuccessResponse
  | ErrorResponse;

export async function POST(request: NextRequest) {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const data = formData.get('data') as string | null;

    if (!data) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
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

    const { metadata, productId, status, version, setAsLatest, licenseIds } =
      body;

    if (file && !(file instanceof File)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (file && file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          message: t('validation.file_too_large', {
            size: bytesToSize(MAX_FILE_SIZE),
          }),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const ip = await getIp();
    if (ip) {
      const key = `releases-create:${ip}`;
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
              releases: {
                where: {
                  productId: validated.data.productId,
                },
              },
              products: {
                where: {
                  id: validated.data.productId,
                },
              },
              limits: true,
              metadata: true,
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
    const previousProductReleases = team.releases;

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

    if (previousProductReleases.length >= team.limits.maxReleasesPerProduct) {
      return NextResponse.json(
        {
          message: t('validation.max_releases_reached'),
        },
        { status: HttpStatus.BAD_REQUEST },
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

      if (setAsLatest) {
        return NextResponse.json(
          {
            message: t('validation.latest_release_not_allowed_with_licenses'),
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }
    }

    if (
      previousProductReleases.find(
        (release) =>
          release.version === version && release.productId === productId,
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

      if (totalStorageUsedMb + uploadeReleaseSizeMb > maxStorage) {
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
          createdByUserId: session.user.id,
          latest: Boolean(setAsLatest && isPublished),
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
      });

      return release;
    });

    const response = {
      release,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.CREATE_RELEASE,
      targetId: release.id,
      targetType: AuditLogTargetType.RELEASE,
      responseBody: response,
      requestBody: body,
    });

    return NextResponse.json(
      {
        release,
      },
      { status: HttpStatus.CREATED },
    );
  } catch (error) {
    logger.error("Error occurred in '/api/products/releases' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

export type IProductsReleasesGetSuccessResponse = {
  releases: (Release & {
    file: ReleaseFile | null;
    product: Product;
    allowedLicenses: Omit<License, 'licenseKeyLookup'>[];
    metadata: Metadata[];
  })[];
  totalResults: number;
  hasLatestRelease: boolean;
  hasResults: boolean;
};

export type IProductsReleasesGetResponse =
  | ErrorResponse
  | IProductsReleasesGetSuccessResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<IProductsReleasesGetResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const searchParams = request.nextUrl.searchParams;
    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const allowedPageSizes = [10, 25, 50, 100];
    const allowedSortDirections = ['asc', 'desc'];
    const allowedSortColumns = ['version', 'createdAt', 'updatedAt', 'latest'];

    const search = (searchParams.get('search') as string) || '';

    const productId = searchParams.get('productId') as string;
    let page = parseInt(searchParams.get('page') as string) || 1;
    let pageSize = parseInt(searchParams.get('pageSize') as string) || 10;
    let sortColumn = searchParams.get('sortColumn') as string;
    let sortDirection = searchParams.get('sortDirection') as 'asc' | 'desc';

    if (!productId || !regex.uuidV4.test(productId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (!allowedSortDirections.includes(sortDirection)) {
      sortDirection = 'desc';
    }

    if (!sortColumn || !allowedSortColumns.includes(sortColumn)) {
      sortColumn = 'createdAt';
    }

    if (!allowedPageSizes.includes(pageSize)) {
      pageSize = 25;
    }

    if (page < 1) {
      page = 1;
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where = {
      teamId: selectedTeam,
      productId: productId || undefined,
      version: search
        ? {
            contains: search,
            mode: 'insensitive',
          }
        : undefined,
    } as Prisma.ReleaseWhereInput;

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
                where,
                include: {
                  product: true,
                  file: true,
                  allowedLicenses: true,
                  metadata: true,
                },
                skip,
                take,
                orderBy: {
                  [sortColumn]: sortDirection,
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

    const [hasResults, totalResults] = await prisma.$transaction([
      prisma.release.findFirst({
        where: {
          teamId: selectedTeam,
        },
        select: {
          id: true,
        },
      }),
      prisma.release.count({
        where,
      }),
    ]);
    const releases = session.user.teams[0].releases.map((release) => ({
      ...release,
      allowedLicenses: release.allowedLicenses.map((license) => ({
        ...license,
        licenseKey: decryptLicenseKey(license.licenseKey),
        licenseKeyLookup: undefined,
      })),
    }));

    const hasLatestRelease = releases.some((release) => release.latest);

    return NextResponse.json({
      releases,
      totalResults,
      hasLatestRelease,
      hasResults: Boolean(hasResults),
    });
  } catch (error) {
    logger.error("Error occurred in 'products' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
