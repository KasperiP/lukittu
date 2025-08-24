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

export type IIpUpdateSuccessResponse = {
  success: true;
};

export type IIpUpdateResponse = ErrorResponse | IIpUpdateSuccessResponse;

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ slug: string; ipId: string }> },
): Promise<NextResponse<IIpUpdateResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const selectedTeam = await getSelectedTeam();
    const licenseId = params.slug;
    const ipId = params.ipId;

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

    if (!regex.uuidV4.test(ipId)) {
      return NextResponse.json(
        {
          message: t('validation.ip_not_found'),
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
              ipAddresses: {
                where: {
                  id: ipId,
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

    if (!team.ipAddresses.length) {
      return NextResponse.json(
        {
          message: t('validation.ip_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const response = await prisma.$transaction(async (prisma) => {
      await prisma.ipAddress.update({
        where: {
          id: ipId,
          teamId: selectedTeam,
          licenseId,
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
          ? AuditLogAction.FORGET_IP
          : AuditLogAction.REMEMBER_IP,
        targetId: ipId,
        targetType: AuditLogTargetType.IP_ADDRESS,
        requestBody: { forgotten },
        responseBody: response,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      return response;
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'ip address update' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
