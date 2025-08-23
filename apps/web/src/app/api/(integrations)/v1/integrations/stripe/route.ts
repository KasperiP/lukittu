import {
  handleCheckoutSessionCompleted,
  handleInvoicePaid,
  handleSubscriptionDeleted,
} from '@/lib/providers/stripe-external';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma, regex } from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Stripe } from 'stripe';

export async function POST(request: NextRequest) {
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';

  logger.info('Stripe webhook: Request started', {
    requestId,
    route: '/v1/integrations/stripe',
    method: 'POST',
    userAgent,
    timestamp: requestTime.toISOString(),
  });

  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');

    if (!teamId || !regex.uuidV4.test(teamId)) {
      logger.warn('Stripe webhook: Invalid teamId provided', {
        requestId,
        teamId,
        route: '/v1/integrations/stripe',
      });
      return NextResponse.json(
        {
          message: 'Invalid teamId',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Stripe from retrying the request
      );
    }

    const key = `stripe-integration:${teamId}`;
    const isLimited = await isRateLimited(key, 60, 10); // 60 requests per 10 seconds

    if (isLimited) {
      logger.warn('Stripe webhook: Rate limit exceeded', {
        requestId,
        teamId,
        rateLimitKey: key,
      });
      return NextResponse.json(
        {
          message: 'Too many requests. Please try again later.',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Stripe from retrying the request
      );
    }

    const rawBody = await request.text();
    const sig = headersList.get('stripe-signature')!;

    if (!sig || !rawBody) {
      logger.warn(
        'Stripe webhook: Invalid request - missing signature or body',
        {
          requestId,
          teamId,
          hasSignature: !!sig,
          hasBody: !!rawBody,
        },
      );
      return NextResponse.json(
        {
          message: 'Invalid request',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Stripe from retrying the request
      );
    }

    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
        deletedAt: null,
      },
      include: {
        stripeIntegration: true,
        settings: true,
        limits: true,
        _count: {
          select: {
            licenses: true,
            customers: true,
          },
        },
      },
    });

    if (!team || !team.stripeIntegration || !team.limits || !team.settings) {
      logger.warn('Stripe webhook: Team not found or missing configuration', {
        requestId,
        teamId,
        hasTeam: !!team,
        hasStripeIntegration: !!team?.stripeIntegration,
        hasLimits: !!team?.limits,
        hasSettings: !!team?.settings,
      });
      return NextResponse.json(
        {
          message: 'Team not found',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Stripe from retrying the request
      );
    }

    const integration = team.stripeIntegration;

    if (!integration.active) {
      logger.warn('Stripe webhook: Integration not active', {
        requestId,
        teamId,
        integrationId: integration.id,
        active: integration.active,
      });
      return NextResponse.json(
        {
          message: 'Stripe integration is not active',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Stripe from retrying the request
      );
    }

    const stripe = new Stripe(team.stripeIntegration.apiKey, {
      apiVersion: '2025-02-24.acacia',
    });

    const event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      team.stripeIntegration.webhookSecret,
    );

    logger.info('Stripe webhook: Processing webhook event', {
      requestId,
      teamId,
      eventType: event.type,
      eventId: event.id,
      created: event.created,
      livemode: event.livemode,
    });

    const startTime = Date.now();

    switch (event.type) {
      case 'invoice.paid':
        await handleInvoicePaid(requestId, event.data.object, team, stripe);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(requestId, event.data.object, team);
        break;
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(
          requestId,
          event.data.object,
          team,
          stripe,
        );
        break;
      default:
        logger.info('Stripe webhook: Unhandled event type', {
          requestId,
          teamId,
          eventType: event.type,
        });
        return NextResponse.json({ success: true });
    }

    const processingTime = Date.now() - startTime;
    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Stripe webhook: Completed', {
      requestId,
      teamId,
      eventType: event.type,
      eventId: event.id,
      processingTimeMs: processingTime,
      responseTimeMs: responseTime,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');

    logger.error('Stripe webhook: Failed', {
      requestId,
      teamId,
      route: '/v1/integrations/stripe',
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      responseTimeMs: responseTime,
      userAgent,
    });

    return NextResponse.json(
      {
        message: 'An error occurred while processing the request',
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
