import { regex } from '@/lib/constants/regex';
import prisma from '@/lib/database/prisma';
import { createAuditLog } from '@/lib/logging/audit-log';
import { logger } from '@/lib/logging/logger';
import {
  decryptLicenseKey,
  encryptLicenseKey,
  generateHMAC,
} from '@/lib/security/crypto';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  SetLicenseScheama,
  setLicenseSchema,
} from '@/lib/validation/licenses/set-license-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogTargetType,
  Customer,
  License,
  Metadata,
  Product,
  User,
} from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type ILicenseGetSuccessResponse = {
  license: Omit<License, 'licenseKeyLookup'> & {
    products: Product[];
    customers: Customer[];
    createdBy: Omit<User, 'passwordHash'> | null;
    metadata: Metadata[];
  };
};

export type ILicenseGetResponse = ILicenseGetSuccessResponse | ErrorResponse;

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ILicenseGetResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const licenseId = params.slug;

    if (!licenseId || !regex.uuidV4.test(licenseId)) {
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
              id: selectedTeam,
              deletedAt: null,
            },
            include: {
              licenses: {
                where: {
                  id: licenseId,
                },
                include: {
                  products: {
                    orderBy: {
                      createdAt: 'desc',
                    },
                  },
                  customers: {
                    orderBy: {
                      createdAt: 'desc',
                    },
                  },
                  createdBy: true,
                  metadata: true,
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

    if (!team.licenses.length) {
      return NextResponse.json(
        {
          message: t('validation.license_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const license = team.licenses[0];

    license.licenseKey = decryptLicenseKey(license.licenseKey);

    return NextResponse.json({
      license,
    });
  } catch (error) {
    logger.error("Error occurred in 'licenses/[slug]' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

export type ILicensesUpdateResponse =
  | ErrorResponse
  | ILicensesUpdateSuccessResponse;

export type ILicensesUpdateSuccessResponse = {
  license: Omit<License, 'licenseKeyLookup'>;
};

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ILicensesUpdateResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const licenseId = params.slug;

    if (!licenseId || !regex.uuidV4.test(licenseId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const body = (await request.json()) as SetLicenseScheama;
    const validated = await setLicenseSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          field: validated.error.errors[0].path[0],
          message: validated.error.errors[0].message,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const {
      customerIds,
      expirationDate,
      expirationDays,
      expirationStart,
      expirationType,
      ipLimit,
      licenseKey,
      metadata,
      productIds,
      suspended,
      seats,
    } = body;

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
              licenses: true,
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

    const hmac = generateHMAC(`${licenseKey}:${team.id}`);

    const licenseExists = await prisma.license.findUnique({
      where: { id: licenseId },
    });

    if (!licenseExists) {
      return NextResponse.json(
        {
          message: t('validation.license_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const isLicenseKeyInUse = team.licenses.some(
      (license) =>
        license.licenseKeyLookup === hmac && license.id !== licenseId,
    );

    if (isLicenseKeyInUse) {
      return NextResponse.json(
        {
          message: t('validation.license_key_exists'),
          field: 'licenseKey',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const productsPromise = prisma.product.findMany({
      where: {
        teamId: team.id,
        id: {
          in: productIds,
        },
      },
    });

    const customersPromise = prisma.customer.findMany({
      where: {
        teamId: team.id,
        id: {
          in: customerIds,
        },
      },
    });

    const [products, customers] = await Promise.all([
      productsPromise,
      customersPromise,
    ]);

    if (products.length !== productIds.length) {
      return NextResponse.json(
        {
          message: t('validation.product_not_found'),
          field: 'productIds',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (customers.length !== customerIds.length) {
      return NextResponse.json(
        {
          message: t('validation.customer_not_found'),
          field: 'customerIds',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const encryptedLicenseKey = encryptLicenseKey(licenseKey);

    const updatedLicense = await prisma.license.update({
      where: { id: licenseId },
      data: {
        expirationDate,
        expirationDays,
        expirationStart: expirationStart || 'CREATION',
        expirationType,
        ipLimit,
        licenseKey: encryptedLicenseKey,
        licenseKeyLookup: hmac,
        metadata: {
          deleteMany: {},
          createMany: {
            data: metadata.map((m) => ({
              ...m,
              teamId: team.id,
            })),
          },
        },
        suspended,
        seats,
        products: {
          set: productIds.map((id) => ({ id })),
        },
        customers: {
          set: customerIds.map((id) => ({ id })),
        },
      },
      include: {
        metadata: true,
      },
    });

    const response = {
      license: {
        ...updatedLicense,
        licenseKey,
        licenseKeyLookup: undefined,
      },
    };

    createAuditLog({
      userId: session.user.id,
      teamId: team.id,
      action: AuditLogAction.UPDATE_LICENSE,
      targetId: updatedLicense.id,
      targetType: AuditLogTargetType.LICENSE,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'licenses/[slug]' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

type ILicensesDeleteSuccessResponse = {
  success: boolean;
};

export type ILicensesDeleteResponse =
  | ErrorResponse
  | ILicensesDeleteSuccessResponse;

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ILicensesDeleteResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const licenseId = params.slug;

    if (!licenseId || !regex.uuidV4.test(licenseId)) {
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

    const license = await prisma.license.findUnique({
      where: {
        id: licenseId,
        teamId: selectedTeam,
      },
    });

    if (!license) {
      return NextResponse.json(
        {
          message: t('validation.license_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    await prisma.license.delete({
      where: {
        id: licenseId,
      },
    });

    const response = {
      success: true,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.DELETE_LICENSE,
      targetId: licenseId,
      targetType: AuditLogTargetType.LICENSE,
      requestBody: null,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'licenses/[slug]' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
