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
  AuditLogTargetType,
  logger,
  prisma,
  regex,
  ReleaseBranch,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type IProductsBranchesUpdateSuccessResponse = {
  branch: ReleaseBranch;
};

export type IProductsBranchesUpdateResponse =
  | IProductsBranchesUpdateSuccessResponse
  | ErrorResponse;

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<IProductsBranchesUpdateResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });
  const params = await props.params;

  try {
    const branchId = params.slug;

    if (!branchId || !regex.uuidV4.test(branchId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

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
    const product = team.products[0];

    if (!product) {
      return NextResponse.json(
        {
          message: t('validation.product_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const existingBranch = product.branches.find(
      (branch) => branch.id === branchId,
    );

    if (!existingBranch) {
      return NextResponse.json(
        {
          message: t('validation.branch_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const existingBranchWithSameName = product.branches.find(
      (branch) => branch.name === name && branch.id !== branchId,
    );

    if (existingBranchWithSameName) {
      return NextResponse.json(
        {
          message: t('validation.branch_name_exists'),
          field: 'name',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const branch = await prisma.releaseBranch.update({
      where: {
        id: branchId,
      },
      data: {
        name,
      },
    });

    const response = {
      branch,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.UPDATE_BRANCH,
      targetId: branch.id,
      targetType: AuditLogTargetType.BRANCH,
      responseBody: response,
      requestBody: body,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'branches/[slug]' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

export type IProductsBranchesDeleteSuccessResponse = {
  success: boolean;
};

export type IProductsBranchesDeleteResponse =
  | IProductsBranchesDeleteSuccessResponse
  | ErrorResponse;

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<IProductsBranchesDeleteResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });
  const params = await props.params;

  try {
    const branchId = params.slug;

    if (!branchId || !regex.uuidV4.test(branchId)) {
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
              products: {
                include: {
                  branches: {
                    where: {
                      id: branchId,
                    },
                    include: {
                      releases: true,
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

    const team = session.user.teams[0];
    const product = team.products.find((product) =>
      product.branches.some((branch) => branch.id === branchId),
    );

    if (!product || !product.branches.length) {
      return NextResponse.json(
        {
          message: t('validation.branch_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const branch = product.branches[0];

    if (branch.releases.length > 0) {
      return NextResponse.json(
        {
          message: t('validation.branch_has_releases'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    await prisma.releaseBranch.delete({
      where: {
        id: branchId,
      },
    });

    const response = {
      success: true,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.DELETE_BRANCH,
      targetId: branchId,
      targetType: AuditLogTargetType.BRANCH,
      requestBody: null,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'branches/[slug]' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
