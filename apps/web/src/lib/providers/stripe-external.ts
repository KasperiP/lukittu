import {
  attemptWebhookDelivery,
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  createCustomerPayload,
  createLicensePayload,
  createWebhookEvents,
  encryptString,
  generateHMAC,
  generateUniqueLicense,
  Limits,
  logger,
  prisma,
  regex,
  Settings,
  StripeIntegration,
  Team,
  updateCustomerPayload,
  WebhookEventType,
} from '@lukittu/shared';
import { after } from 'next/server';
import 'server-only';
import Stripe from 'stripe';
import { StripeMetadataKeys } from '../constants/metadata';
import { sendLicenseDistributionEmail } from '../emails/templates/send-license-distribution-email';
import { createAuditLog } from '../logging/audit-log';

type ExtendedTeam = Team & {
  settings: Settings | null;
  limits: Limits | null;
  stripeIntegration: StripeIntegration | null;
  _count: {
    licenses: number;
    customers: number;
  };
};

export const handleInvoicePaid = async (
  requestId: string,
  invoice: Stripe.Invoice,
  team: ExtendedTeam,
  stripe: Stripe,
) => {
  const handlerStartTime = Date.now();

  try {
    if (!invoice.billing_reason) {
      logger.info(
        'handleInvoicePaid: Stripe invoice skipped - no billing reason',
        {
          requestId,
          teamId: team.id,
          invoiceId: invoice.id,
        },
      );
      return;
    }

    // At the beginning, after the billing_reason check
    if (!invoice.subscription || typeof invoice.subscription !== 'string') {
      logger.info(
        'handleInvoicePaid: Stripe invoice skipped - not a subscription invoice',
        {
          requestId,
          teamId: team.id,
          invoiceId: invoice.id,
          billingReason: invoice.billing_reason,
          subscriptionId: invoice.subscription,
        },
      );
      return;
    }

    const subscription = await stripe.subscriptions.retrieve(
      invoice.subscription as string,
    );

    const lukittuLicenseId = subscription.metadata.lukittu_license_id;

    if (invoice.billing_reason === 'subscription_create') {
      if (lukittuLicenseId) {
        logger.info(
          'handleInvoicePaid: Stripe invoice skipped - license already exists',
          {
            requestId,
            teamId: team.id,
            subscriptionId: subscription.id,
            licenseId: lukittuLicenseId,
          },
        );
        return;
      }

      const stripeCustomerId = subscription.customer as string;
      const stripeCustomer = await stripe.customers.retrieve(stripeCustomerId);

      if (stripeCustomer.deleted) {
        logger.info(
          'handleInvoicePaid: Stripe invoice skipped - customer not found or deleted',
          {
            requestId,
            teamId: team.id,
            customerId: stripeCustomerId,
          },
        );
        return;
      }

      const item = subscription.items.data[0];

      const product = await stripe.products.retrieve(
        item.price.product as string,
      );

      const lukittuProductId = product.metadata.product_id;
      const ipLimit = product.metadata.ip_limit as string | undefined;

      /**
       * @deprecated use hwid_limit. Only for backward compatibility.
       */
      const legacySeats = product.metadata.seats as string | undefined;
      const hwidLimit =
        product.metadata.hwid_limit || (legacySeats as string | undefined);

      if (!lukittuProductId || !regex.uuidV4.test(lukittuProductId)) {
        logger.info(
          'handleInvoicePaid: Stripe invoice skipped - invalid product ID',
          {
            requestId,
            teamId: team.id,
            subscriptionId: subscription.id,
            productId: lukittuProductId,
          },
        );
        return;
      }

      const productExists = await prisma.product.findUnique({
        where: {
          id: lukittuProductId,
        },
      });

      if (!productExists) {
        logger.info(
          'handleInvoicePaid: Stripe invoice skipped - product not found',
          {
            requestId,
            teamId: team.id,
            productId: lukittuProductId,
          },
        );
        return;
      }

      if (team._count.licenses >= (team.limits?.maxLicenses ?? 0)) {
        logger.info(
          'handleInvoicePaid: Stripe invoice skipped - license limit reached',
          {
            requestId,
            teamId: team.id,
            currentLicenses: team._count.licenses,
            maxLicenses: team.limits?.maxLicenses,
          },
        );
        return;
      }

      if (team._count.customers >= (team.limits?.maxCustomers ?? 0)) {
        logger.info(
          'handleInvoicePaid: Stripe invoice skipped - customer limit reached',
          {
            requestId,
            teamId: team.id,
            currentCustomers: team._count.customers,
            maxCustomers: team.limits?.maxCustomers,
          },
        );
        return;
      }

      const parsedIpLimit = parseInt(ipLimit || '');
      if (ipLimit && (isNaN(parsedIpLimit) || parsedIpLimit < 0)) {
        logger.info(
          'handleInvoicePaid: Stripe invoice skipped - invalid IP limit',
          {
            requestId,
            teamId: team.id,
            ipLimit,
          },
        );
        return;
      }

      const parsedHwidLimit = parseInt(hwidLimit || '');
      if (hwidLimit && (isNaN(parsedHwidLimit) || parsedHwidLimit < 0)) {
        logger.info(
          'handleInvoicePaid: Stripe invoice skipped - invalid HWID limit',
          {
            requestId,
            teamId: team.id,
            hwidLimit,
          },
        );
        return;
      }

      const metadata = [
        {
          key: StripeMetadataKeys.STRIPE_SUB,
          value: subscription.id,
          locked: true,
        },
        {
          key: StripeMetadataKeys.STRIPE_CUS,
          value: stripeCustomerId,
          locked: true,
        },
        {
          key: StripeMetadataKeys.STRIPE_PROD,
          value: product.id,
          locked: true,
        },
      ];

      const webhookEventIds: string[] = [];

      const license = await prisma.$transaction(async (prisma) => {
        // TODO: There might be multiple customers with same email. This should be handled.
        const existingLukittuCustomer = await prisma.customer.findFirst({
          where: {
            email: stripeCustomer.email,
            teamId: team.id,
          },
        });

        const lukittuCustomer = await prisma.customer.upsert({
          where: {
            id: existingLukittuCustomer?.id || '',
            teamId: team.id,
          },
          create: {
            email: stripeCustomer.email!,
            fullName: stripeCustomer.name ?? undefined,
            teamId: team.id,
            metadata: {
              createMany: {
                data: metadata.map((m) => ({
                  ...m,
                  teamId: team.id,
                })),
              },
            },
          },
          update: {},
          include: {
            metadata: true,
            address: true,
          },
        });

        await createAuditLog({
          teamId: team.id,
          action: existingLukittuCustomer?.id
            ? AuditLogAction.UPDATE_CUSTOMER
            : AuditLogAction.CREATE_CUSTOMER,
          targetId: lukittuCustomer.id,
          targetType: AuditLogTargetType.CUSTOMER,
          requestBody: {
            fullName: lukittuCustomer.fullName,
            email: lukittuCustomer.email,
            metadata: metadata.map((m) => ({
              key: m.key,
              value: m.value,
              locked: m.locked,
            })),
          },
          responseBody: { customer: lukittuCustomer },
          source: AuditLogSource.STRIPE_INTEGRATION,
          tx: prisma,
        });

        const customerWebhookEvents = await createWebhookEvents({
          teamId: team.id,
          eventType: existingLukittuCustomer?.id
            ? WebhookEventType.CUSTOMER_UPDATED
            : WebhookEventType.CUSTOMER_CREATED,
          payload: existingLukittuCustomer?.id
            ? updateCustomerPayload(lukittuCustomer)
            : createCustomerPayload(lukittuCustomer),
          source: AuditLogSource.STRIPE_INTEGRATION,
          tx: prisma,
        });

        webhookEventIds.push(...customerWebhookEvents);

        const licenseKey = await generateUniqueLicense(team.id);
        const hmac = generateHMAC(`${licenseKey}:${team.id}`);

        if (!licenseKey) {
          logger.error(
            'handleInvoicePaid: Failed to generate a unique license key',
          );
          throw new Error('Failed to generate a unique license key');
        }

        const encryptedLicenseKey = encryptString(licenseKey);

        const license = await prisma.license.create({
          data: {
            licenseKey: encryptedLicenseKey,
            teamId: team.id,
            customers: {
              connect: {
                id: lukittuCustomer.id,
              },
            },
            licenseKeyLookup: hmac,
            metadata: {
              createMany: {
                data: metadata.map((m) => ({
                  ...m,
                  teamId: team.id,
                })),
              },
            },
            products: {
              connect: {
                id: lukittuProductId,
              },
            },
            ipLimit: ipLimit ? parsedIpLimit : null,
            hwidLimit: hwidLimit ? parsedHwidLimit : null,
            expirationType: 'DATE',
            expirationDate: new Date(subscription.current_period_end * 1000),
          },
          include: {
            products: true,
            customers: true,
            metadata: true,
          },
        });

        await createAuditLog({
          teamId: team.id,
          action: AuditLogAction.CREATE_LICENSE,
          targetId: license.id,
          targetType: AuditLogTargetType.LICENSE,
          requestBody: {
            licenseKey,
            teamId: team.id,
            customers: [lukittuCustomer.id],
            products: [lukittuProductId],
            metadata: metadata.map((m) => ({
              key: m.key,
              value: m.value,
              locked: m.locked,
            })),
            ipLimit,
            hwidLimit,
            expirationType: 'DATE',
            expirationDate: new Date(subscription.current_period_end * 1000),
          },
          responseBody: {
            license: {
              ...license,
              licenseKey,
              licenseKeyLookup: undefined,
            },
          },
          source: AuditLogSource.STRIPE_INTEGRATION,
          tx: prisma,
        });

        const licenseWebhookEvents = await createWebhookEvents({
          eventType: WebhookEventType.LICENSE_CREATED,
          teamId: team.id,
          payload: createLicensePayload(license),
          source: AuditLogSource.STRIPE_INTEGRATION,
          tx: prisma,
        });

        webhookEventIds.push(...licenseWebhookEvents);

        const success = await sendLicenseDistributionEmail({
          customer: lukittuCustomer,
          licenseKey,
          license,
          team,
        });

        if (!success) {
          logger.error(
            'handleInvoicePaid: Failed to send license distribution email',
          );
          throw new Error('Failed to send license distribution email');
        }

        await stripe.subscriptions.update(subscription.id, {
          metadata: {
            ...subscription.metadata,
            lukittu_license_id: license.id,
            lukittu_customer_id: lukittuCustomer.id,
            lukittu_license_key: licenseKey,
            lukittu_event_description: 'Recurring subscription',
          },
        });

        return license;
      });

      after(async () => {
        await attemptWebhookDelivery(webhookEventIds);
      });

      logger.info('handleInvoicePaid: License created for subscription', {
        subscriptionId: subscription.id,
        teamId: team.id,
        licenseId: license.id,
        customerId: stripeCustomerId,
        productId: lukittuProductId,
      });

      return license;
    }

    if (invoice.billing_reason === 'subscription_cycle') {
      if (!lukittuLicenseId || !regex.uuidV4.test(lukittuLicenseId)) {
        logger.info(
          'handleInvoicePaid: Stripe invoice skipped - no license ID for renewal',
          {
            requestId,
            teamId: team.id,
            subscriptionId: subscription.id,
            licenseId: lukittuLicenseId,
          },
        );
        return;
      }

      const license = await prisma.license.findUnique({
        where: { id: lukittuLicenseId },
      });

      if (!license) {
        logger.info(
          'handleInvoicePaid: Stripe invoice skipped - license not found for renewal',
          {
            requestId,
            teamId: team.id,
            subscriptionId: subscription.id,
            licenseId: lukittuLicenseId,
          },
        );
        return;
      }

      const updatedLicense = await prisma.license.update({
        where: { id: lukittuLicenseId },
        data: {
          expirationDate: new Date(subscription.current_period_end * 1000),
        },
      });

      logger.info(
        'handleInvoicePaid: License expiration updated on subscription renewal',
        {
          licenseId: updatedLicense.id,
          subscriptionId: subscription.id,
          teamId: team.id,
          newExpirationDate: subscription.current_period_end,
        },
      );

      return updatedLicense;
    }

    const handlerTime = Date.now() - handlerStartTime;

    logger.info(
      'handleInvoicePaid: Stripe invoice skipped - unhandled billing reason',
      {
        requestId,
        teamId: team.id,
        invoiceId: invoice.id,
        billingReason: invoice.billing_reason,
        subscriptionId: invoice.subscription,
        handlerTimeMs: handlerTime,
      },
    );
  } catch (error) {
    const handlerTime = Date.now() - handlerStartTime;

    logger.error('handleInvoicePaid: Stripe invoice processing failed', {
      requestId,
      teamId: team.id,
      invoiceId: invoice.id,
      subscriptionId: invoice.subscription,
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      handlerTimeMs: handlerTime,
    });
    throw error;
  }
};

export const handleSubscriptionDeleted = async (
  requestId: string,
  subscription: Stripe.Subscription,
  team: ExtendedTeam,
) => {
  const handlerStartTime = Date.now();

  logger.info(
    'handleSubscriptionDeleted: Processing Stripe subscription deletion',
    {
      requestId,
      teamId: team.id,
      subscriptionId: subscription.id,
      status: subscription.status,
      canceledAt: subscription.canceled_at,
    },
  );

  try {
    const licenseId = subscription.metadata.lukittu_license_id;

    if (!licenseId || !regex.uuidV4.test(licenseId)) {
      logger.info(
        'handleSubscriptionDeleted: Stripe subscription deletion skipped - no license ID',
        {
          requestId,
          teamId: team.id,
          subscriptionId: subscription.id,
          metadata: subscription.metadata,
        },
      );
      return;
    }

    const license = await prisma.license.findUnique({
      where: {
        id: licenseId,
      },
    });

    if (!license) {
      logger.info(
        'handleSubscriptionDeleted: Stripe subscription deletion skipped - license not found',
        {
          requestId,
          teamId: team.id,
          subscriptionId: subscription.id,
          licenseId,
        },
      );
      return;
    }

    const updatedLicense = await prisma.license.update({
      where: {
        id: licenseId,
      },
      data: {
        expirationDate: new Date(),
      },
    });

    logger.info(
      'handleSubscriptionDeleted: Subscription deleted and license expired',
      {
        licenseId,
        subscriptionId: subscription.id,
        teamId: team.id,
        expirationDate: new Date().toISOString(),
      },
    );

    const handlerTime = Date.now() - handlerStartTime;

    logger.info(
      'handleSubscriptionDeleted: Stripe subscription deleted successfully',
      {
        requestId,
        teamId: team.id,
        subscriptionId: subscription.id,
        licenseId: license.id,
        handlerTimeMs: handlerTime,
      },
    );

    return updatedLicense;
  } catch (error) {
    const handlerTime = Date.now() - handlerStartTime;

    logger.error(
      'handleSubscriptionDeleted: Stripe subscription deletion failed',
      {
        requestId,
        teamId: team.id,
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        handlerTimeMs: handlerTime,
      },
    );
    throw error;
  }
};

export const handleCheckoutSessionCompleted = async (
  requestId: string,
  session: Stripe.Checkout.Session,
  team: ExtendedTeam,
  stripe: Stripe,
) => {
  const handlerStartTime = Date.now();

  try {
    if (session.payment_status !== 'paid' || session.mode !== 'payment') {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - invalid payment status or mode',
        {
          requestId,
          teamId: team.id,
          sessionId: session.id,
          paymentStatus: session.payment_status,
          mode: session.mode,
        },
      );
      return;
    }

    const customer = session.customer_details;

    if (!customer || !customer.email) {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - no customer email',
        {
          requestId,
          teamId: team.id,
          sessionId: session.id,
        },
      );
      return;
    }

    const lineItems = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items'],
    });

    const item = lineItems.line_items?.data[0];
    if (!item || !item.price) {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - no line items or price',
        {
          requestId,
          teamId: team.id,
          sessionId: session.id,
        },
      );
      return;
    }

    if (item.price.type !== 'one_time') {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - not one-time price',
        {
          requestId,
          teamId: team.id,
          sessionId: session.id,
          priceType: item.price.type,
        },
      );
      return;
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(
      session.payment_intent as string,
    );

    if (paymentIntent.metadata.lukittu_license_id) {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - license already exists',
        {
          requestId,
          teamId: team.id,
          sessionId: session.id,
          paymentIntentId: session.payment_intent,
        },
      );
      return;
    }

    if (team._count.licenses >= (team.limits?.maxLicenses ?? 0)) {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - license limit reached',
        {
          requestId,
          teamId: team.id,
          currentLicenses: team._count.licenses,
          maxLicenses: team.limits?.maxLicenses,
        },
      );
      return;
    }

    if (team._count.customers >= (team.limits?.maxCustomers ?? 0)) {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - customer limit reached',
        {
          requestId,
          teamId: team.id,
          currentCustomers: team._count.customers,
          maxCustomers: team.limits?.maxCustomers,
        },
      );
      return;
    }

    const product = await stripe.products.retrieve(
      item.price.product as string,
    );
    const lukittuProductId = product.metadata.product_id;
    const ipLimit = product.metadata.ip_limit as string | undefined;

    /**
     * @deprecated use hwid_limit. Only for backward compatibility.
     */
    const legacySeats = product.metadata.seats as string | undefined;
    const hwidLimit = (product.metadata.hwid_limit || legacySeats) as
      | string
      | undefined;
    const expirationDays = product.metadata.expiration_days as
      | string
      | undefined;
    const expirationStart = product.metadata.expiration_start as
      | string
      | undefined;

    if (!lukittuProductId || !regex.uuidV4.test(lukittuProductId)) {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - invalid product ID',
        {
          requestId,
          teamId: team.id,
          sessionId: session.id,
          productId: lukittuProductId,
        },
      );
      return;
    }

    const productExists = await prisma.product.findUnique({
      where: {
        id: lukittuProductId,
        teamId: team.id,
      },
    });

    if (!productExists) {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - product not found',
        {
          requestId,
          teamId: team.id,
          sessionId: session.id,
          productId: lukittuProductId,
        },
      );
      return;
    }

    const parsedIpLimit = parseInt(ipLimit || '');
    if (ipLimit && (isNaN(parsedIpLimit) || parsedIpLimit < 0)) {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - invalid IP limit',
        {
          requestId,
          teamId: team.id,
          sessionId: session.id,
          ipLimit,
        },
      );
      return;
    }

    const parsedHwidLimit = parseInt(hwidLimit || '');
    if (hwidLimit && (isNaN(parsedHwidLimit) || parsedHwidLimit < 0)) {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - invalid HWID limit',
        {
          requestId,
          teamId: team.id,
          sessionId: session.id,
          hwidLimit,
        },
      );
      return;
    }

    const parsedExpirationDays = parseInt(expirationDays || '');
    if (
      expirationDays &&
      (isNaN(parsedExpirationDays) || parsedExpirationDays < 0)
    ) {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - invalid expiration days',
        {
          requestId,
          teamId: team.id,
          sessionId: session.id,
          expirationDays,
        },
      );
      return;
    }

    if (expirationStart && !expirationDays) {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - expiration start without days',
        {
          requestId,
          teamId: team.id,
          sessionId: session.id,
          expirationStart,
        },
      );
      return;
    }

    const allowedExpirationStarts = ['ACTIVATION', 'CREATION'];

    if (
      expirationStart &&
      !allowedExpirationStarts.includes(expirationStart.toUpperCase())
    ) {
      logger.info(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - invalid expiration start',
        {
          requestId,
          teamId: team.id,
          sessionId: session.id,
          expirationStart,
        },
      );
      return;
    }

    const expirationStartFormatted =
      expirationStart?.toUpperCase() === 'ACTIVATION'
        ? 'ACTIVATION'
        : 'CREATION';
    const expirationDate =
      (!expirationStart || expirationStart.toUpperCase() === 'CREATION') &&
      expirationDays
        ? new Date(Date.now() + parsedExpirationDays * 24 * 60 * 60 * 1000)
        : null;

    const metadata = [
      {
        key: StripeMetadataKeys.STRIPE_CS,
        value: session.id,
        locked: true,
      },
      {
        key: StripeMetadataKeys.STRIPE_PI,
        value: item.price!.id,
        locked: true,
      },
      {
        key: StripeMetadataKeys.STRIPE_PROD,
        value: product.id,
        locked: true,
      },
    ];

    const webhookEventIds: string[] = [];

    const license = await prisma.$transaction(async (prisma) => {
      // TODO: There might be multiple customers with same email. This should be handled.
      const existingLukittuCustomer = await prisma.customer.findFirst({
        where: {
          email: customer.email,
          teamId: team.id,
        },
      });

      const lukittuCustomer = await prisma.customer.upsert({
        where: {
          id: existingLukittuCustomer?.id || '',
          teamId: team.id,
        },
        create: {
          email: customer.email!,
          fullName: customer.name,
          address: customer.address
            ? {
                create: {
                  city: customer.address.city,
                  country: customer.address.country,
                  line1: customer.address.line1,
                  line2: customer.address.line2,
                  postalCode: customer.address.postal_code,
                  state: customer.address.state,
                },
              }
            : undefined,
          teamId: team.id,
          metadata: {
            createMany: {
              data: metadata.map((m) => ({
                ...m,
                teamId: team.id,
              })),
            },
          },
        },
        update: {},
        include: {
          metadata: true,
          address: true,
        },
      });

      await createAuditLog({
        teamId: team.id,
        action: existingLukittuCustomer?.id
          ? AuditLogAction.UPDATE_CUSTOMER
          : AuditLogAction.CREATE_CUSTOMER,
        targetId: lukittuCustomer.id,
        targetType: AuditLogTargetType.CUSTOMER,
        requestBody: {
          fullName: lukittuCustomer.fullName,
          email: lukittuCustomer.email,
          metadata: metadata.map((m) => ({
            key: m.key,
            value: m.value,
            locked: m.locked,
          })),
        },
        responseBody: { customer: lukittuCustomer },
        source: AuditLogSource.STRIPE_INTEGRATION,
        tx: prisma,
      });

      const customerWebhookEvents = await createWebhookEvents({
        teamId: team.id,
        eventType: existingLukittuCustomer?.id
          ? WebhookEventType.CUSTOMER_UPDATED
          : WebhookEventType.CUSTOMER_CREATED,
        payload: existingLukittuCustomer?.id
          ? updateCustomerPayload(lukittuCustomer)
          : createCustomerPayload(lukittuCustomer),
        source: AuditLogSource.STRIPE_INTEGRATION,
        tx: prisma,
      });

      webhookEventIds.push(...customerWebhookEvents);

      const licenseKey = await generateUniqueLicense(team.id);
      const hmac = generateHMAC(`${licenseKey}:${team.id}`);

      if (!licenseKey) {
        logger.error(
          'handleCheckoutSessionCompleted: Failed to generate a unique license key',
        );
        throw new Error('Failed to generate a unique license key');
      }

      const encryptedLicenseKey = encryptString(licenseKey);

      const license = await prisma.license.create({
        data: {
          licenseKey: encryptedLicenseKey,
          teamId: team.id,
          customers: {
            connect: {
              id: lukittuCustomer.id,
            },
          },
          licenseKeyLookup: hmac,
          metadata: {
            createMany: {
              data: metadata.map((m) => ({
                ...m,
                teamId: team.id,
              })),
            },
          },
          products: {
            connect: {
              id: lukittuProductId,
            },
          },
          ipLimit: ipLimit ? parsedIpLimit : null,
          hwidLimit: hwidLimit ? parsedHwidLimit : null,
          expirationType: expirationDays ? 'DURATION' : 'NEVER',
          expirationDays: expirationDays ? parsedExpirationDays : null,
          expirationStart: expirationStartFormatted,
          expirationDate,
        },
        include: {
          products: true,
          customers: true,
          metadata: true,
        },
      });

      await createAuditLog({
        teamId: team.id,
        action: AuditLogAction.CREATE_LICENSE,
        targetId: license.id,
        targetType: AuditLogTargetType.LICENSE,
        requestBody: {
          licenseKey,
          teamId: team.id,
          customers: [lukittuCustomer.id],
          products: [lukittuProductId],
          metadata: metadata.map((m) => ({
            key: m.key,
            value: m.value,
            locked: m.locked,
          })),
          ipLimit,
          hwidLimit,
          expirationType: expirationDays ? 'DURATION' : 'NEVER',
          expirationDays: expirationDays || null,
          expirationStart: expirationStartFormatted,
        },
        responseBody: {
          license: {
            ...license,
            licenseKey,
            licenseKeyLookup: undefined,
          },
        },
        source: AuditLogSource.STRIPE_INTEGRATION,
        tx: prisma,
      });

      const licenseWebhookEvents = await createWebhookEvents({
        eventType: WebhookEventType.LICENSE_CREATED,
        teamId: team.id,
        payload: createLicensePayload(license),
        source: AuditLogSource.STRIPE_INTEGRATION,
        tx: prisma,
      });

      webhookEventIds.push(...licenseWebhookEvents);

      const success = await sendLicenseDistributionEmail({
        customer: lukittuCustomer,
        licenseKey,
        license,
        team,
      });

      if (!success) {
        logger.error(
          'handleCheckoutSessionCompleted: Failed to send license distribution email',
        );
        throw new Error('Failed to send license distribution email');
      }

      await stripe.paymentIntents.update(session.payment_intent as string, {
        metadata: {
          ...session.metadata,
          lukittu_license_id: license.id,
          lukittu_customer_id: lukittuCustomer.id,
          lukittu_license_key: licenseKey,
          lukittu_event_description: 'One-time purchase',
        },
      });

      return license;
    });

    after(async () => {
      await attemptWebhookDelivery(webhookEventIds);
    });

    const handlerTime = Date.now() - handlerStartTime;

    logger.info(
      'handleCheckoutSessionCompleted: Stripe checkout session processed successfully',
      {
        requestId,
        teamId: team.id,
        sessionId: session.id,
        licenseId: license.id,
        customerEmail: customer.email,
        productId: lukittuProductId,
        paymentIntentId: session.payment_intent,
        handlerTimeMs: handlerTime,
      },
    );

    return license;
  } catch (error) {
    const handlerTime = Date.now() - handlerStartTime;

    logger.error(
      'handleCheckoutSessionCompleted: Stripe checkout session processing failed',
      {
        requestId,
        teamId: team.id,
        sessionId: session.id,
        paymentIntentId: session.payment_intent,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        handlerTimeMs: handlerTime,
      },
    );
    throw error;
  }
};
