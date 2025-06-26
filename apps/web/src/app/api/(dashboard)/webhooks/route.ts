import { createAuditLog } from '@/lib/logging/audit-log';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setWebhookSchema,
  SetWebhookSchema,
} from '@/lib/validation/webhooks/set-webhook-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  logger,
  prisma,
  Prisma,
  Webhook,
} from '@lukittu/shared';
import crypto from 'crypto';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type IWebhookGetSuccessResponse = {
  webhooks: Webhook[];
  totalResults: number;
  hasResults: boolean;
};

export type IWebhookGetResponse = ErrorResponse | IWebhookGetSuccessResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<IWebhookGetResponse>> {
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
    const allowedSortColumns = ['createdAt', 'updatedAt', 'name', 'active'];

    const search = (searchParams.get('search') as string) || '';

    let page = parseInt(searchParams.get('page') as string) || 1;
    let pageSize = parseInt(searchParams.get('pageSize') as string) || 10;
    let sortColumn = searchParams.get('sortColumn') as string;
    let sortDirection = searchParams.get('sortDirection') as 'asc' | 'desc';

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
      teamId: selectedTeam,
      ...(search && {
        OR: [
          {
            name: { contains: search, mode: 'insensitive' },
          },
          {
            url: { contains: search, mode: 'insensitive' },
          },
        ],
      }),
    } as Prisma.WebhookWhereInput;

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
              id: selectedTeam,
            },
            include: {
              webhooks: {
                where,
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
      prisma.webhook.findFirst({
        where: {
          teamId: selectedTeam,
        },
        select: {
          id: true,
        },
      }),
      prisma.webhook.count({
        where,
      }),
    ]);

    const webhooks = session.user.teams[0].webhooks;

    return NextResponse.json({
      webhooks,
      totalResults,
      hasResults: Boolean(hasResults),
    });
  } catch (error) {
    logger.error("Error occurred in 'webhooks' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

type IWebhookCreateSuccessResponse = {
  webhook: Webhook;
};

export type IWebhookCreateResponse =
  | ErrorResponse
  | IWebhookCreateSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IWebhookCreateResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetWebhookSchema;
    const validated = await setWebhookSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          field: validated.error.errors[0].path[0],
          message: validated.error.errors[0].message,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { name, url, active, enabledEvents } = validated.data;

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
              webhooks: true,
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

    if (team.webhooks.length >= team.limits.maxWebhooks) {
      return NextResponse.json(
        {
          message: t('validation.webhook_limit_reached'),
          field: 'name',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Check if webhook with same name already exists
    if (team.webhooks.find((webhook) => webhook.name === name)) {
      return NextResponse.json(
        {
          message: t('validation.webhook_name_already_exists'),
          field: 'name',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Check if webhook with same URL already exists
    if (team.webhooks.find((webhook) => webhook.url === url)) {
      return NextResponse.json(
        {
          message: t('validation.webhook_url_already_exists'),
          field: 'url',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const secret = crypto.randomBytes(32).toString('hex');

    const response = await prisma.$transaction(async (prisma) => {
      const webhook = await prisma.webhook.create({
        data: {
          name,
          url,
          secret,
          active,
          enabledEvents,
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
        webhook,
      };

      await createAuditLog({
        userId: session.user.id,
        teamId: team.id,
        action: AuditLogAction.CREATE_WEBHOOK,
        targetId: webhook.id,
        targetType: AuditLogTargetType.WEBHOOK,
        requestBody: body,
        responseBody: response,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      return response;
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'webhooks' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
