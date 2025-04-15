import prisma from '@/lib/database/prisma';
import { createAuditLog } from '@/lib/logging/audit-log';
import { logger } from '@/lib/logging/logger';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setLatestReleaseSchema,
  SetLatestReleaseSchema,
} from '@/lib/validation/products/set-latest-release-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogTargetType,
  ReleaseStatus,
} from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type IProductsReleasesSetLatestSuccessResponse = {
  success: boolean;
};

export type IProductsReleasesSetLatestResponse =
  | ErrorResponse
  | IProductsReleasesSetLatestSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IProductsReleasesSetLatestResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetLatestReleaseSchema;
    const validated = await setLatestReleaseSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          field: validated.error.errors[0].path[0],
          message: validated.error.errors[0].message,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { releaseId } = validated.data;

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
                include: {
                  allowedLicenses: true,
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

    const release = team.releases.find((r) => r.id === releaseId);

    if (!release) {
      return NextResponse.json(
        {
          message: t('validation.release_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (release.status !== ReleaseStatus.PUBLISHED) {
      return NextResponse.json(
        {
          message: t('validation.latest_release_must_be_published'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (release.allowedLicenses.length) {
      return NextResponse.json(
        {
          message: t('validation.latest_release_not_allowed_with_licenses'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    await prisma.$transaction([
      prisma.release.updateMany({
        where: {
          productId: release.productId,
        },
        data: {
          latest: false,
        },
      }),
      prisma.release.update({
        where: {
          id: releaseId,
        },
        data: {
          latest: true,
        },
      }),
    ]);

    const response = {
      success: true,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: team.id,
      action: AuditLogAction.SET_LATEST_RELEASE,
      targetId: releaseId,
      targetType: AuditLogTargetType.RELEASE,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      "Error occurred in 'products/releases/set-latest' route",
      error,
    );
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
