import { logger } from '@/lib/logging/logger';
import {
  handleInvoicePaid,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from '@/lib/providers/stripe-internal';
import { HttpStatus } from '@/types/http-status';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const sig = request.headers.get('stripe-signature')!;

    if (!sig || !rawBody) {
      logger.error('Invalid request', { sig, rawBody });
      return NextResponse.json(
        { message: 'Invalid request' },
        { status: HttpStatus.OK },
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-02-24.acacia',
    });

    const event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );

    switch (event.type) {
      case 'invoice.paid':
        return handleInvoicePaid(event, stripe);
      case 'customer.subscription.deleted':
        return handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
      case 'customer.subscription.updated':
        return handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          stripe,
        );
      default:
        return NextResponse.json({ success: true });
    }
  } catch (error) {
    logger.error(
      "Error occurred in '(integrations)/v1/integrations/stripe/internal' route",
      { error },
    );
    return NextResponse.json(
      { message: 'Error processing request' },
      { status: HttpStatus.OK },
    );
  }
}
