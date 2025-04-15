import { regex } from '@/lib/constants/regex';
import prisma from '@/lib/database/prisma';
import { logger } from '@/lib/logging/logger';
import {
  handleCheckoutSessionCompleted,
  handleInvoicePaid,
  handleSubscriptionDeleted,
} from '@/lib/providers/stripe-external';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { HttpStatus } from '@/types/http-status';
import { NextRequest, NextResponse } from 'next/server';
import { Stripe } from 'stripe';

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');

    if (!teamId || !regex.uuidV4.test(teamId)) {
      logger.error('Invalid teamId', { teamId });
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
      logger.error('Rate limited', { key });
      return NextResponse.json(
        {
          message: 'Too many requests. Please try again later.',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Stripe from retrying the request
      );
    }

    const rawBody = await request.text();
    const sig = request.headers.get('stripe-signature')!;

    if (!sig || !rawBody) {
      logger.error('Invalid request', { sig, rawBody });
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
      logger.error('Team not found or missing required fields', { teamId });
      return NextResponse.json(
        {
          message: 'Team not found',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Stripe from retrying the request
      );
    }

    const integration = team.stripeIntegration;

    if (!integration.active) {
      logger.error('Stripe integration is not active', { teamId });
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

    switch (event.type) {
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object, team, stripe);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object, team);
        break;
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object, team, stripe);
        break;
      default:
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(
      "Error occurred in '(integrations)/v1/integrations/stripe' route",
      error,
    );

    return NextResponse.json(
      {
        message: 'An error occurred while processing the request',
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
