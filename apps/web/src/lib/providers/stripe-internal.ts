import { HttpStatus } from '@/types/http-status';
import { logger, prisma } from '@lukittu/shared';
import { NextResponse } from 'next/server';
import 'server-only';
import Stripe from 'stripe';
import { DEFAULT_LIMITS } from '../constants/limits';
import { sendDiscordWebhook } from './discord-webhook';

async function getProductMetadata(stripe: Stripe, priceId: string) {
  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  const product = price.product as Stripe.Product;

  return {
    limits: {
      maxLicenses: +product.metadata.max_licenses || DEFAULT_LIMITS.maxLicenses,
      maxProducts: +product.metadata.max_products || DEFAULT_LIMITS.maxProducts,
      logRetention:
        +product.metadata.log_retention || DEFAULT_LIMITS.logRetention,
      maxCustomers:
        +product.metadata.max_customers || DEFAULT_LIMITS.maxCustomers,
      maxTeamMembers:
        +product.metadata.max_team_members || DEFAULT_LIMITS.maxTeamMembers,
      maxBlacklist:
        +product.metadata.max_blacklist || DEFAULT_LIMITS.maxBlacklist,
      maxStorage: +product.metadata.max_storage || DEFAULT_LIMITS.maxStorage,
      maxApiKeys: +product.metadata.max_api_keys || DEFAULT_LIMITS.maxApiKeys,
      maxReleasesPerProduct:
        +product.metadata.max_releases_per_product ||
        DEFAULT_LIMITS.maxReleasesPerProduct,
      maxInvitations:
        +product.metadata.max_invitations || DEFAULT_LIMITS.maxInvitations,
      allowClassloader: product.metadata.allow_classloader === 'true',
      allowCustomEmails: product.metadata.allow_custom_emails === 'true',
      allowWatermarking: product.metadata.allow_watermarking === 'true',
    },
    plan: product.metadata.subscription_name || 'free',
  };
}

export async function handleInvoicePaid(event: Stripe.Event, stripe: Stripe) {
  const invoice = event.data.object as Stripe.Invoice;

  await sendDiscordWebhook(process.env.INTERNAL_STATUS_WEBHOOK!, {
    embeds: [
      {
        title: '💰 Invoice Paid',
        color: 0x00ff00,
        fields: [
          {
            name: 'Amount',
            value: `$${(invoice.amount_paid / 100).toFixed(2)}`,
            inline: true,
          },
          {
            name: 'Customer ID',
            value: `[${invoice.customer}](https://dashboard.stripe.com/customers/${invoice.customer})`,
            inline: true,
          },
          {
            name: 'Subscription ID',
            value: invoice.subscription
              ? `[${invoice.subscription}](https://dashboard.stripe.com/subscriptions/${invoice.subscription})`
              : 'N/A',
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });

  if (!invoice.subscription) {
    logger.error('Invoice paid, but not a subscription', { event });
    return NextResponse.json(
      { message: 'Subscription not found' },
      { status: HttpStatus.OK },
    );
  }

  const subscription = await stripe.subscriptions.retrieve(
    invoice.subscription as string,
  );

  if (!subscription.customer) {
    logger.error('Customer not found', { event });
    return NextResponse.json(
      { message: 'Customer not found' },
      { status: HttpStatus.OK },
    );
  }

  const customer = await stripe.customers.retrieve(
    subscription.customer as string,
  );

  if (customer.deleted) {
    logger.error('Customer deleted', { event });
    return NextResponse.json(
      { message: 'Customer deleted' },
      { status: HttpStatus.OK },
    );
  }

  const teamId = subscription.metadata.lukittu_team_id;

  if (!teamId) {
    logger.error('Team ID not found', { event });
    return NextResponse.json(
      { message: 'Team ID not found' },
      { status: HttpStatus.OK },
    );
  }

  await stripe.customers.update(customer.id, {
    metadata: { lukittu_team_id: teamId },
  });

  const productMetadata = await getProductMetadata(
    stripe,
    subscription.items.data[0].price.id,
  );

  const lukittuSubscription = await prisma.$transaction(
    async (prisma) => {
      const lukittuSubscription = await prisma.subscription.upsert({
        where: { teamId },
        update: {
          stripeSubscriptionId: invoice.subscription as string,
          billingPeriodEndsAt: new Date(subscription.current_period_end * 1000),
          status: subscription.status as string,
          plan: productMetadata.plan,
          canceledAt: null,
        },
        create: {
          teamId,
          status: subscription.status as string,
          stripeSubscriptionId: invoice.subscription as string,
          stripeCustomerId: subscription.customer as string,
          billingPeriodEndsAt: new Date(subscription.current_period_end * 1000),
          plan: productMetadata.plan,
        },
      });

      await prisma.limits.upsert({
        where: { teamId },
        update: productMetadata.limits,
        create: { teamId, ...productMetadata.limits },
      });

      return lukittuSubscription;
    },
    {
      isolationLevel: 'Serializable',
    },
  );

  logger.info('Subscription updated', { lukittuSubscription });
  return NextResponse.json({ success: true });
}

export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
) {
  await sendDiscordWebhook(process.env.INTERNAL_STATUS_WEBHOOK!, {
    embeds: [
      {
        title: '🗑️ Subscription Deleted',
        color: 0xff0000,
        fields: [
          {
            name: 'Team ID',
            value: subscription.metadata.lukittu_team_id || 'N/A',
            inline: true,
          },
          {
            name: 'Customer ID',
            value: `[${subscription.customer}](https://dashboard.stripe.com/customers/${subscription.customer})`,
            inline: true,
          },
          {
            name: 'Subscription ID',
            value: `[${subscription.id}](https://dashboard.stripe.com/subscriptions/${subscription.id})`,
            inline: true,
          },
          {
            name: 'Status',
            value: `\`${subscription.status}\``,
            inline: true,
          },
          {
            name: 'Ends',
            value: `<t:${Math.floor(subscription.current_period_end)}:f>`,
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });

  const teamId = subscription.metadata.lukittu_team_id;
  if (!teamId) {
    logger.error('Team ID not found', { subscription });
    return NextResponse.json(
      { message: 'Team ID not found' },
      { status: HttpStatus.OK },
    );
  }

  const existingSubscription = await prisma.subscription.findUnique({
    where: { teamId },
  });

  if (!existingSubscription) {
    logger.info('Subscription not found in database, skipping update');
    return NextResponse.json({ success: true });
  }

  await prisma.subscription.update({
    where: { teamId },
    data: { status: 'canceled', canceledAt: new Date() },
  });

  logger.info('Subscription canceled', { subscription });
  return NextResponse.json({ success: true });
}

export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  stripe: Stripe,
) {
  let title: string;
  let color: number;

  if (subscription.cancel_at_period_end) {
    title = '🛑 Subscription Scheduled for Cancellation';
    color = 0xffa500; // Orange
  } else if (subscription.status === 'past_due') {
    title = '⚠️ Subscription Payment Past Due';
    color = 0xff6b6b; // Red-Orange
  } else if (subscription.status === 'unpaid') {
    title = '❌ Subscription Payment Failed';
    color = 0xff0000; // Red
  } else if (subscription.status === 'trialing') {
    title = '🎯 Subscription Trial Started';
    color = 0x00ff00; // Green
  } else if (subscription.status === 'active') {
    title = '✅ Subscription Updated';
    color = 0x0099ff; // Blue
  } else {
    title = '📝 Subscription Status Changed';
    color = 0x808080; // Gray
  }

  const currentPrice = subscription.items.data[0].price;
  const formattedAmount = `$${(currentPrice.unit_amount || 0) / 100}/${currentPrice.recurring?.interval || 'one-time'}`;

  const periodEndTimestamp = Math.floor(subscription.current_period_end);
  const trialEndTimestamp = subscription.trial_end
    ? Math.floor(subscription.trial_end)
    : null;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: 'Team ID',
      value: subscription.metadata.lukittu_team_id || 'N/A',
      inline: true,
    },
    {
      name: 'Customer ID',
      value: `[${subscription.customer}](https://dashboard.stripe.com/customers/${subscription.customer})`,
      inline: true,
    },
    {
      name: 'Subscription ID',
      value: `[${subscription.id}](https://dashboard.stripe.com/subscriptions/${subscription.id})`,
      inline: true,
    },
    { name: 'Status', value: `\`${subscription.status}\``, inline: true },
    { name: 'Price', value: `\`${formattedAmount}\``, inline: true },
    {
      name: 'Current Period End',
      value: `<t:${periodEndTimestamp}:f>`,
      inline: true,
    },
    {
      name: subscription.cancel_at_period_end
        ? 'Cancellation Effect'
        : 'Renewal',
      value: subscription.cancel_at_period_end
        ? '⚠️ Will cancel at period end'
        : '🔄 Will auto-renew',
      inline: true,
    },
  ];

  if (trialEndTimestamp) {
    fields.push({
      name: 'Trial Ends',
      value: `<t:${trialEndTimestamp}:f>`,
      inline: true,
    });
  }

  await sendDiscordWebhook(process.env.INTERNAL_STATUS_WEBHOOK!, {
    embeds: [
      {
        title,
        color,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  });

  const teamId = subscription.metadata.lukittu_team_id;
  if (!teamId) {
    logger.error('Team ID not found', { subscription });
    return NextResponse.json(
      { message: 'Team ID not found' },
      { status: HttpStatus.OK },
    );
  }

  const existingSubscription = await prisma.subscription.findUnique({
    where: { teamId },
  });

  if (!existingSubscription) {
    logger.info('Subscription not found in database, skipping update');
    return NextResponse.json({ success: true });
  }

  const productMetadata = await getProductMetadata(
    stripe,
    subscription.items.data[0].price.id,
  );

  const isActive = subscription.status === 'active';

  await prisma.$transaction(
    async (prisma) => {
      await prisma.subscription.update({
        where: { teamId },
        data: {
          status: subscription.status,
          plan: productMetadata.plan,
          billingPeriodEndsAt: isActive
            ? new Date(subscription.current_period_end * 1000)
            : null,
        },
      });

      await prisma.limits.upsert({
        where: { teamId },
        update: productMetadata.limits,
        create: { teamId, ...productMetadata.limits },
      });
    },
    {
      isolationLevel: 'Serializable',
    },
  );

  return NextResponse.json({ success: true });
}
