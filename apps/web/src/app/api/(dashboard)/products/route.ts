import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setProductSchema,
  SetProductSchema,
} from '@/lib/validation/products/set-product-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogTargetType,
  logger,
  Metadata,
  prisma,
  Prisma,
  Product,
  regex,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type IProductsGetSuccessResponse = {
  products: (Product & {
    latestRelease: string | null;
    totalReleases: number;
    metadata: Metadata[];
  })[];
  totalResults: number;
  hasResults: boolean;
};

export type IProductsGetResponse = ErrorResponse | IProductsGetSuccessResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<IProductsGetResponse>> {
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
    const allowedSortColumns = ['name', 'createdAt', 'updatedAt'];

    const search = (searchParams.get('search') as string) || '';

    const licenseId = searchParams.get('licenseId') as string;
    const licenseCountMin = searchParams.get('licenseCountMin');
    const licenseCountMax = searchParams.get('licenseCountMax');
    const licenseCountComparisonMode = searchParams.get(
      'licenseCountComparisonMode',
    );
    let page = parseInt(searchParams.get('page') as string) || 1;
    let pageSize = parseInt(searchParams.get('pageSize') as string) || 10;
    let sortColumn = searchParams.get('sortColumn') as string;
    let sortDirection = searchParams.get('sortDirection') as 'asc' | 'desc';

    if (licenseId && !regex.uuidV4.test(licenseId)) {
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

    let licenseCountFilter: Prisma.ProductWhereInput | undefined;

    if (licenseCountMin) {
      const min = parseInt(licenseCountMin);
      if (!isNaN(min) && min >= 0) {
        let havingClause: Prisma.Sql | undefined;

        switch (licenseCountComparisonMode) {
          case 'between': {
            const max = parseInt(licenseCountMax || '');
            if (!isNaN(max)) {
              havingClause = Prisma.sql`HAVING COUNT(l.id) >= ${min} AND COUNT(l.id) <= ${max}`;
            }
            break;
          }
          case 'equals':
            havingClause = Prisma.sql`HAVING COUNT(l.id) = ${min}`;
            break;
          case 'greater':
            havingClause = Prisma.sql`HAVING COUNT(l.id) > ${min}`;
            break;
          case 'less':
            havingClause = Prisma.sql`HAVING COUNT(l.id) < ${min}`;
            break;
        }

        if (havingClause) {
          const filteredProductIds = await prisma.$queryRaw<{ id: string }[]>`
            SELECT p.id
            FROM "Product" p
            LEFT JOIN "_LicenseToProduct" lp ON p.id = lp."B"
            LEFT JOIN "License" l ON lp."A" = l.id
            WHERE p."teamId" = ${selectedTeam}
            GROUP BY p.id
            ${havingClause}
          `;

          licenseCountFilter = {
            id: {
              in: filteredProductIds.map((p) => p.id),
            },
          };
        }
      }
    }

    const where = {
      teamId: selectedTeam,
      ...licenseCountFilter,
      licenses: licenseId
        ? {
            some: {
              id: licenseId,
            },
          }
        : undefined,
      name: search
        ? {
            contains: search,
            mode: 'insensitive',
          }
        : undefined,
    } as Prisma.ProductWhereInput;

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
              id: selectedTeam,
            },
            include: {
              products: {
                where,
                include: {
                  releases: true,
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
      prisma.product.findFirst({
        where: {
          teamId: selectedTeam,
        },
        select: {
          id: true,
        },
      }),
      prisma.product.count({
        where,
      }),
    ]);
    const products = session.user.teams[0].products;

    return NextResponse.json({
      products: products.map((product) => ({
        ...product,
        releases: undefined,
        latestRelease:
          product.releases.find((release) => release.latest)?.version || null,
        totalReleases: product.releases.length || 0,
      })),
      totalResults,
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

type IProductsCreateSuccessResponse = {
  product: Product;
};

export type IProductsCreateResponse =
  | ErrorResponse
  | IProductsCreateSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IProductsCreateResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetProductSchema;
    const validated = await setProductSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          field: validated.error.errors[0].path[0],
          message: validated.error.errors[0].message,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { name, url, metadata } = validated.data;

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
              products: true,
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

    if (team.products.length >= team.limits.maxProducts) {
      return NextResponse.json(
        {
          message: t('validation.max_products_reached'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (team.products.find((product) => product.name === name)) {
      return NextResponse.json(
        {
          message: t('validation.product_already_exists'),
          field: 'name',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const product = await prisma.product.create({
      data: {
        name,
        url: url || null,
        metadata: {
          createMany: {
            data: metadata.map((m) => ({
              ...m,
              teamId: team.id,
            })),
          },
        },
        createdBy: {
          connect: {
            id: session.user.id,
          },
        },
        team: {
          connect: {
            id: selectedTeam,
          },
        },
      },
    });

    const response = {
      product,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: team.id,
      action: AuditLogAction.CREATE_PRODUCT,
      targetId: product.id,
      targetType: AuditLogTargetType.PRODUCT,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
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
