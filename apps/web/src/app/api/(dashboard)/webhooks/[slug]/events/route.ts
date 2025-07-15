import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  logger,
  prisma,
  Prisma,
  regex,
  User,
  WebhookEvent,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type IWebhookEventsGetSuccessResponse = {
  events: (WebhookEvent & {
    user: Omit<User, 'passwordHash'> | null;
  })[];
  totalResults: number;
  hasResults: boolean;
};

export type IWebhookEventsGetResponse =
  | IWebhookEventsGetSuccessResponse
  | ErrorResponse;

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<IWebhookEventsGetResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const searchParams = request.nextUrl.searchParams;
    const webhookId = params.slug;

    if (!webhookId || !regex.uuidV4.test(webhookId)) {
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

    const allowedPageSizes = [10, 25, 50, 100];
    const allowedSortDirections = ['asc', 'desc'];
    const allowedSortColumns = [
      'createdAt',
      'updatedAt',
      'status',
      'eventType',
    ];

    let page = parseInt(searchParams.get('page') as string) || 1;
    let pageSize = parseInt(searchParams.get('pageSize') as string) || 25;
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
                where: {
                  id: webhookId,
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

    if (!team.webhooks.length) {
      return NextResponse.json(
        {
          message: t('validation.webhook_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const where = {
      webhookId,
    } as Prisma.WebhookEventWhereInput;

    const [events, totalResults, hasResults] = await prisma.$transaction([
      prisma.webhookEvent.findMany({
        where,
        skip,
        take,
        orderBy: {
          [sortColumn]: sortDirection,
        },
        include: {
          user: true,
        },
      }),
      prisma.webhookEvent.count({
        where,
      }),
      prisma.webhookEvent.findFirst({
        where: {
          webhookId,
        },
        select: {
          id: true,
        },
      }),
    ]);

    return NextResponse.json({
      events,
      totalResults,
      hasResults: Boolean(hasResults),
    });
  } catch (error) {
    logger.error("Error occurred in 'webhooks/[slug]/events' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
