import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setBranchSchema,
  SetBranchSchema,
} from '@/lib/validation/products/set-branch-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  logger,
  Prisma,
  prisma,
  regex,
  ReleaseBranch,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type IProductsBranchesGetSuccessResponse = {
  branches: (ReleaseBranch & {
    releaseCount: number;
  })[];
  totalResults: number;
  hasResults: boolean;
};

export type IProductsBranchesGetResponse =
  | ErrorResponse
  | IProductsBranchesGetSuccessResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<IProductsBranchesGetResponse>> {
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
    const allowedSortColumns = ['name', 'createdAt'];

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
      productId,
      product: {
        teamId: selectedTeam,
      },
    } as Prisma.ReleaseBranchWhereInput;

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
                where: {
                  id: productId,
                  teamId: selectedTeam,
                },
                include: {
                  branches: {
                    where,
                    skip,
                    take,
                    orderBy: {
                      [sortColumn]: sortDirection,
                    },
                    include: {
                      _count: {
                        select: {
                          releases: true,
                        },
                      },
                    },
                  },
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
      prisma.releaseBranch.findFirst({
        where: {
          productId,
          product: {
            teamId: selectedTeam,
          },
        },
        select: {
          id: true,
        },
      }),
      prisma.releaseBranch.count({
        where,
      }),
    ]);

    const team = session.user.teams[0];

    const product = team.products[0];

    if (!product) {
      return NextResponse.json(
        {
          message: t('validation.product_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const branches = product.branches;

    const branchesFormatted = branches.map((branch) => ({
      ...branch,
      releases: undefined,
      releaseCount: branch._count.releases,
    }));

    return NextResponse.json({
      branches: branchesFormatted,
      totalResults,
      hasResults: !!hasResults,
    });
  } catch (error) {
    logger.error("Error occurred in 'branches' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

type IBranchesCreateSuccessResponse = {
  branch: ReleaseBranch;
};

export type IProductsBranchesCreateResponse =
  | ErrorResponse
  | IBranchesCreateSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IProductsBranchesCreateResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetBranchSchema;
    const validated = setBranchSchema(t).safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          field: validated.error.errors[0].path[0],
          message: validated.error.errors[0].message,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { name, productId } = validated.data;

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
              limits: true,
              products: {
                where: {
                  id: productId,
                  teamId: selectedTeam,
                },
                include: {
                  branches: true,
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

    const product = team.products[0];

    if (!product) {
      return NextResponse.json(
        {
          message: t('validation.product_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const existingBranches = product.branches;

    const existingBranch = existingBranches.find(
      (branch) => branch.name === name,
    );

    if (existingBranch) {
      return NextResponse.json(
        {
          message: t('validation.branch_name_exists'),
          field: 'name',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (existingBranches.length >= team.limits.maxBranchesPerProduct) {
      return NextResponse.json(
        {
          message: t('validation.branch_limit_reached'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const branch = await prisma.releaseBranch.create({
      data: {
        name,
        productId,
      },
    });

    const response = {
      branch,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.CREATE_BRANCH,
      targetId: branch.id,
      targetType: AuditLogTargetType.BRANCH,
      responseBody: response,
      requestBody: body,
      source: AuditLogSource.DASHBOARD,
    });

    return NextResponse.json(response, {
      status: HttpStatus.CREATED,
    });
  } catch (error) {
    logger.error("Error occurred in 'branches' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
