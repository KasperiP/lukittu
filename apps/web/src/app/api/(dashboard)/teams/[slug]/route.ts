import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage } from '@/lib/utils/header-helpers';
import {
  SetTeamSchema,
  setTeamSchema,
} from '@/lib/validation/team/set-team-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  ApiKey,
  AuditLogAction,
  AuditLogTargetType,
  Limits,
  logger,
  prisma,
  regex,
  Settings,
  Subscription,
  Team,
  User,
  WatermarkingSettings,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export interface ITeamsDeleteRequest {
  teamNameConfirmation: string;
}

type ITeamsDeleteSuccessResponse = {
  success: boolean;
};

export type ITeamsDeleteResponse = ErrorResponse | ITeamsDeleteSuccessResponse;

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ITeamsDeleteResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = await request.json();
    const { teamNameConfirmation } = body as ITeamsDeleteRequest;
    const teamId = params.slug;

    if (!teamId || !regex.uuidV4.test(teamId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const session = await getSession({ user: true });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
        deletedAt: null,
      },
      include: {
        users: true,
        subscription: true,
      },
    });

    if (!team) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (teamNameConfirmation !== team.name.toUpperCase()) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (team.ownerId !== session.user.id) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (team.users.length > 1) {
      return NextResponse.json(
        {
          message: t('validation.team_has_users'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Cancel the subscription if it exists
    if (team.subscription) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2025-02-24.acacia',
      });

      const subscription = await stripe.subscriptions.retrieve(
        team.subscription.stripeSubscriptionId,
      );

      // Cancel the subscription
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
      });
    }

    await prisma.team.update({
      where: {
        id: teamId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    const response = {
      success: true,
    };

    createAuditLog({
      action: AuditLogAction.DELETE_TEAM,
      userId: session.user.id,
      teamId: team.id,
      targetType: AuditLogTargetType.TEAM,
      targetId: team.id,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error("Error occurred in 'teams/[slug]' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

type ITeamsEditSuccessResponse = {
  team: Team;
};

export type ITeamsEditResponse = ErrorResponse | ITeamsEditSuccessResponse;

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ITeamsEditResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const teamId = params.slug;

    if (!teamId || !regex.uuidV4.test(teamId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const body = (await request.json()) as SetTeamSchema;
    const validated = await setTeamSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { name } = validated.data;

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              id: teamId,
              deletedAt: null,
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
          field: 'id',
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const updatedTeam = await prisma.team.update({
      where: {
        id: teamId,
      },
      data: {
        name,
      },
    });

    const response = {
      team: updatedTeam,
    };

    createAuditLog({
      action: AuditLogAction.UPDATE_TEAM,
      userId: session.user.id,
      teamId,
      targetType: AuditLogTargetType.TEAM,
      targetId: teamId,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'teams' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

export type ITeamGetSuccessResponse = {
  team: Team & {
    owner: Omit<User, 'passwordHash'>;
    publicKey: string;
    settings: Settings;
    limits: Limits;
    subscription: Subscription | null;
    apiKeys: (Omit<ApiKey, 'key'> & {
      createdBy: {
        fullName: string;
        email: string;
      } | null;
    })[];
    totalStorageUsed: number;
    counts: {
      memberCount: number;
      productCount: number;
      licenseCount: number;
      customerCount: number;
    };
    watermarkingSettings: WatermarkingSettings | null;
  };
};

export type ITeamGetResponse = ErrorResponse | ITeamGetSuccessResponse;

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ITeamGetResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const teamId = params.slug;

    if (!teamId || !regex.uuidV4.test(teamId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              id: teamId,
              deletedAt: null,
            },
            include: {
              owner: true,
              keyPair: true,
              settings: true,
              limits: true,
              subscription: true,
              watermarkingSettings: true,
              apiKeys: {
                include: {
                  createdBy: {
                    select: {
                      email: true,
                      fullName: true,
                    },
                  },
                },
                orderBy: {
                  createdAt: 'desc',
                },
              },
              _count: {
                select: {
                  users: true,
                  products: true,
                  licenses: true,
                  customers: true,
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

    const teamReleaseFiles = await prisma.releaseFile.findMany({
      where: {
        release: {
          teamId,
        },
      },
    });

    const totalStorageUsed = teamReleaseFiles.reduce(
      (acc, file) => acc + file.size,
      0,
    );

    const team = session.user.teams[0];

    return NextResponse.json({
      team: {
        ...team,
        owner: team.owner,
        publicKey: team.keyPair!.publicKey,
        _count: undefined,
        keyPair: undefined,
        settings: team.settings!,
        totalStorageUsed,
        limits: team.limits!,
        counts: {
          memberCount: team._count.users,
          productCount: team._count.products,
          licenseCount: team._count.licenses,
          customerCount: team._count.customers,
        },
      },
    });
  } catch (error) {
    logger.error("Error occurred in 'teams/[slug]' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
