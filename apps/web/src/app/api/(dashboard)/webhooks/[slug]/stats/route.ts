import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma, regex } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type IWebhookStatsGetSuccessResponse = {
  dailyStats: {
    date: string;
    delivered: number;
    failed: number;
    pending: number;
    total: number;
  }[];
  summary: {
    totalEvents: number;
    deliveredEvents: number;
    failedEvents: number;
    pendingEvents: number;
    deliveryRate: number;
  };
};

export type IWebhookStatsGetResponse =
  | IWebhookStatsGetSuccessResponse
  | ErrorResponse;

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<IWebhookStatsGetResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const webhookId = params.slug;
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30');

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

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get daily statistics
    const dailyStats = await prisma.$queryRaw<
      {
        date: string;
        delivered: number;
        failed: number;
        pending: number;
        total: number;
      }[]
    >`
      SELECT 
        DATE("createdAt") as "date",
        COUNT(CASE WHEN "status" = 'DELIVERED' THEN 1 END) as "delivered",
        COUNT(CASE WHEN "status" = 'FAILED' THEN 1 END) as "failed",
        COUNT(CASE WHEN "status" IN ('PENDING', 'IN_PROGRESS', 'RETRY_SCHEDULED') THEN 1 END) as "pending",
        COUNT(*) as "total"
      FROM "WebhookEvent"
      WHERE "webhookId" = ${webhookId}
        AND "createdAt" >= ${startDate}
      GROUP BY DATE("createdAt")
      ORDER BY "date" DESC
    `;

    // Get summary statistics
    const summaryResults = await prisma.$queryRaw<
      {
        total_events: number;
        delivered_events: number;
        failed_events: number;
        pending_events: number;
      }[]
    >`
      SELECT 
        COUNT(*) as "total_events",
        COUNT(CASE WHEN "status" = 'DELIVERED' THEN 1 END) as "delivered_events",
        COUNT(CASE WHEN "status" = 'FAILED' THEN 1 END) as "failed_events",
        COUNT(CASE WHEN "status" IN ('PENDING', 'IN_PROGRESS', 'RETRY_SCHEDULED') THEN 1 END) as "pending_events"
      FROM "WebhookEvent"
      WHERE "webhookId" = ${webhookId}
        AND "createdAt" >= ${startDate}
    `;

    const summaryData = summaryResults[0] || {
      total_events: 0,
      delivered_events: 0,
      failed_events: 0,
      pending_events: 0,
    };

    const summary = {
      totalEvents: Number(summaryData.total_events),
      deliveredEvents: Number(summaryData.delivered_events),
      failedEvents: Number(summaryData.failed_events),
      pendingEvents: Number(summaryData.pending_events),
      deliveryRate:
        summaryData.total_events > 0
          ? Math.round(
              (Number(summaryData.delivered_events) /
                Number(summaryData.total_events)) *
                100,
            )
          : 0,
    };

    return NextResponse.json({
      dailyStats: dailyStats.map((stat) => ({
        date: stat.date,
        delivered: Number(stat.delivered),
        failed: Number(stat.failed),
        pending: Number(stat.pending),
        total: Number(stat.total),
      })),
      summary,
    });
  } catch (error) {
    logger.error("Error occurred in 'webhooks/[slug]/stats' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
