import { DEFAULT_LIMITS } from '@/lib/constants/limits';
import { sendDiscordWebhook } from '@/lib/providers/discord-webhook';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma } from '@lukittu/shared';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function GET(request: NextRequest) {
  try {
    const reqHeaders = await headers();
    const authorizationHeader = reqHeaders.get('authorization');

    if (authorizationHeader !== process.env.INTERNAL_API_KEY) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-02-24.acacia',
    });

    const subscriptions = await prisma.subscription.findMany();

    const results = {
      processed: 0,
      updated: 0,
      errors: 0,
    };

    for (const subscription of subscriptions) {
      try {
        results.processed++;

        const stripeSubscription = await stripe.subscriptions.retrieve(
          subscription.stripeSubscriptionId!,
        );

        if (stripeSubscription.status !== 'active') {
          await prisma.$transaction(async (tx) => {
            await tx.subscription.update({
              where: { id: subscription.id },
              data: {
                status: stripeSubscription.status,
              },
            });

            await tx.limits.update({
              where: { teamId: subscription.teamId },
              data: DEFAULT_LIMITS,
            });
          });

          results.updated++;
          logger.info('Updated subscription and limits to default', {
            teamId: subscription.teamId,
            subscriptionId: subscription.id,
            stripeStatus: stripeSubscription.status,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
      } catch (error) {
        results.errors++;
        logger.error('Error processing subscription', {
          subscriptionId: subscription.id,
          error,
        });
      }
    }

    await sendDiscordWebhook(process.env.INTERNAL_STATUS_WEBHOOK!, {
      embeds: [
        {
          title: '🤖 Daily Subscription Check Results',
          color: results.errors > 0 ? 0xff6b6b : 0x00ff00, // Red if errors, green if success
          fields: [
            {
              name: '📊 Statistics',
              value: [
                `👉 Processed: \`${results.processed}\` subscriptions`,
                `✨ Updated: \`${results.updated}\` subscriptions`,
                `❌ Errors: \`${results.errors}\` occurrences`,
              ].join('\n'),
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    });

    return NextResponse.json(results);
  } catch (error) {
    logger.error('Error in check-status endpoint', { error });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
