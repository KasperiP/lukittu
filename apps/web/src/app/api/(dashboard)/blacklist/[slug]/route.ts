import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setBlacklistSchema,
  SetBlacklistSchema,
} from '@/lib/validation/blacklist/set-blacklist-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogTargetType,
  Blacklist,
  logger,
  prisma,
  regex,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type IBlacklistDeleteSuccessResponse = {
  success: boolean;
};

export type IBlacklistDeleteResponse =
  | ErrorResponse
  | IBlacklistDeleteSuccessResponse;

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<IBlacklistDeleteResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const blacklistId = params.slug;

    if (!blacklistId || !regex.uuidV4.test(blacklistId)) {
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

    const blacklist = await prisma.blacklist.findUnique({
      where: {
        id: blacklistId,
        teamId: selectedTeam,
      },
    });

    if (!blacklist) {
      return NextResponse.json(
        {
          message: t('validation.blacklist_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    await prisma.blacklist.delete({
      where: {
        id: blacklistId,
      },
    });

    const response = {
      success: true,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.DELETE_BLACKLIST,
      targetId: blacklist.id,
      targetType: AuditLogTargetType.BLACKLIST,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'blacklist/[slug]' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

export type IBlacklistUpdateSuccessResponse = {
  blacklist: Blacklist;
};

export type IBlacklistUpdateResponse =
  | ErrorResponse
  | IBlacklistUpdateSuccessResponse;

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<IBlacklistUpdateResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const blacklistId = params.slug;

    if (!blacklistId || !regex.uuidV4.test(blacklistId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const body = (await request.json()) as SetBlacklistSchema;
    const validated = await setBlacklistSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          field: validated.error.errors[0].path[0],
          message: validated.error.errors[0].message,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { value, type, metadata } = validated.data;

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
              blacklist: true,
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

    if (!team.blacklist.find((blacklist) => blacklist.id === blacklistId)) {
      return NextResponse.json(
        {
          message: t('validation.blacklist_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (
      team.blacklist.find(
        (blacklist) =>
          blacklist.value === value &&
          blacklist.id !== blacklistId &&
          blacklist.type === type,
      )
    ) {
      return NextResponse.json(
        {
          message: t('validation.blacklist_exists'),
          field: 'value',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const blacklist = await prisma.blacklist.update({
      where: {
        id: blacklistId,
      },
      data: {
        value,
        type,
        metadata: {
          deleteMany: {},
          createMany: {
            data: metadata.map((m) => ({
              ...m,
              teamId: team.id,
            })),
          },
        },
      },
    });

    const response = {
      blacklist,
    };

    createAuditLog({
      userId: session.user.id,
      teamId: selectedTeam,
      action: AuditLogAction.UPDATE_BLACKLIST,
      targetId: blacklist.id,
      targetType: AuditLogTargetType.BLACKLIST,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'blacklist/[slug]' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
