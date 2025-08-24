import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  logger,
  prisma,
  regex,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type IHwidUpdateSuccessResponse = {
  success: true;
};

export type IHwidUpdateResponse = ErrorResponse | IHwidUpdateSuccessResponse;

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ slug: string; hwidId: string }> },
): Promise<NextResponse<IHwidUpdateResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const selectedTeam = await getSelectedTeam();
    const licenseId = params.slug;
    const hwidId = params.hwidId;

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (!regex.uuidV4.test(licenseId)) {
      return NextResponse.json(
        {
          message: t('validation.license_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (!regex.uuidV4.test(hwidId)) {
      return NextResponse.json(
        {
          message: t('validation.hwid_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const body = await request.json();
    const { forgotten } = body;

    if (typeof forgotten !== 'boolean') {
      return NextResponse.json(
        {
          message: t('validation.invalid_forgotten_value'),
        },
        { status: HttpStatus.BAD_REQUEST },
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
              hardwareIdentifiers: {
                where: {
                  id: hwidId,
                  licenseId,
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

    if (!team.hardwareIdentifiers.length) {
      return NextResponse.json(
        {
          message: t('validation.hwid_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const response = await prisma.$transaction(async (prisma) => {
      await prisma.hardwareIdentifier.update({
        where: {
          id: hwidId,
          licenseId,
          teamId: team.id,
        },
        data: {
          forgotten: Boolean(forgotten),
        },
      });

      const response = {
        success: true as const,
      };

      await createAuditLog({
        userId: session.user.id,
        teamId: selectedTeam,
        action: forgotten
          ? AuditLogAction.FORGET_HWID
          : AuditLogAction.REMEMBER_HWID,
        targetId: hwidId,
        targetType: AuditLogTargetType.HARDWARE_IDENTIFIER,
        requestBody: { forgotten },
        responseBody: response,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      return response;
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'hwid update' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
