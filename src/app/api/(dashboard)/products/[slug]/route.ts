import { regex } from '@/lib/constants/regex';
import prisma from '@/lib/database/prisma';
import { createAuditLog } from '@/lib/utils/audit-log';
import { getSession } from '@/lib/utils/auth';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { logger } from '@/lib/utils/logger';
import {
  setProductSchema,
  SetProductSchema,
} from '@/lib/validation/products/set-product-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogTargetType,
  Product,
  User,
} from '@prisma/client';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type IProductGetSuccessResponse = {
  product: Product & {
    createdBy: Omit<User, 'passwordHash'> | null;
  };
};

export type IProductGetResponse = IProductGetSuccessResponse | ErrorResponse;

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } },
): Promise<NextResponse<IProductGetResponse>> {
  const t = await getTranslations({ locale: getLanguage() });

  try {
    const productId = params.slug;

    if (!productId || !regex.uuidV4.test(productId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const selectedTeam = getSelectedTeam();

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
                },
                include: {
                  createdBy: true,
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

    if (!team.products.length) {
      return NextResponse.json(
        {
          message: t('validation.product_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const product = team.products[0];

    return NextResponse.json({
      product,
    });
  } catch (error) {
    logger.error("Error occurred in 'products/[slug]' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

type ProductDeleteRequest = {
  productNameConfirmation: string;
};

type IProductsDeleteSuccessResponse = {
  success: boolean;
};

export type IProductsDeleteResponse =
  | ErrorResponse
  | IProductsDeleteSuccessResponse;

export async function DELETE(
  request: NextRequest,
  { params }: { params: { slug: string } },
): Promise<NextResponse<IProductsDeleteResponse>> {
  const t = await getTranslations({ locale: getLanguage() });

  try {
    const body = await request.json();
    const { productNameConfirmation } = body as ProductDeleteRequest;
    const productId = params.slug;

    if (!productId || !regex.uuidV4.test(productId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const selectedTeam = getSelectedTeam();

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
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        teamId: selectedTeam,
      },
    });

    if (!product) {
      return NextResponse.json(
        {
          message: t('validation.product_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (productNameConfirmation !== product.name.toUpperCase()) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    await prisma.product.delete({
      where: {
        id: productId,
      },
    });

    const response = {
      success: true,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.DELETE_PRODUCT,
      targetId: product.id,
      targetType: AuditLogTargetType.PRODUCT,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'products/[slug]' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

export type IProductsUpdateSuccessResponse = {
  product: Product;
};

export type IProductsUpdateResponse =
  | ErrorResponse
  | IProductsUpdateSuccessResponse;

export async function PUT(
  request: NextRequest,
  { params }: { params: { slug: string } },
): Promise<NextResponse<IProductsUpdateResponse>> {
  const t = await getTranslations({ locale: getLanguage() });

  try {
    const productId = params.slug;

    if (!productId || !regex.uuidV4.test(productId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

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

    const selectedTeam = getSelectedTeam();

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

    if (!team.products.find((product) => product.id === productId)) {
      return NextResponse.json(
        {
          message: t('validation.product_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (
      team.products.find(
        (product) => product.name === name && product.id !== productId,
      )
    ) {
      return NextResponse.json(
        {
          message: t('validation.product_already_exists'),
          field: 'name',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const product = await prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        name,
        url: url || null,
        metadata,
      },
    });

    const response = {
      product,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.UPDATE_PRODUCT,
      targetId: product.id,
      targetType: AuditLogTargetType.PRODUCT,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'products/[slug]' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
