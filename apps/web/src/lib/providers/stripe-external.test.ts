import {
  encryptLicenseKey,
  generateHMAC,
  generateUniqueLicense,
  Limits,
  logger,
  Settings,
  StripeIntegration,
  Team,
} from '@lukittu/shared';
import { Stripe } from 'stripe';
import { prismaMock } from '../../../jest.setup';
import { sendLicenseDistributionEmail } from '../emails/templates/send-license-distribution-email';
import {
  handleCheckoutSessionCompleted,
  handleInvoicePaid,
  handleSubscriptionDeleted,
} from './stripe-external';

type ExtendedTeam = Team & {
  settings: Settings | null;
  limits: Limits | null;
  stripeIntegration: StripeIntegration | null;
  _count: {
    licenses: number;
    customers: number;
  };
};

jest.mock('../logging/audit-log', () => ({
  createAuditLog: jest.fn().mockResolvedValue({}),
}));

jest.mock('../emails/templates/send-license-distribution-email', () => ({
  __esModule: true,
  sendLicenseDistributionEmail: jest.fn(),
}));

describe('Stripe Integration', () => {
  let mockStripe: jest.Mocked<Stripe>;
  const mockTeam = {
    id: 'team-123',
    name: 'Test Team',
    ownerId: 'owner-123',
    imageUrl: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    settings: {
      id: 'settings-123',
      teamId: 'team-123',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    limits: {
      id: 'limits-123',
      teamId: 'team-123',
      maxLicenses: 100,
      maxCustomers: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    stripeIntegration: {
      id: 'stripe-123',
      teamId: 'team-123',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    _count: {
      licenses: 0,
      customers: 0,
    },
  } as ExtendedTeam;

  const mockSession = {
    id: 'cs_test_123',
    payment_status: 'paid',
    mode: 'payment',
    payment_intent: 'pi_123',
    customer_details: {
      email: 'test@example.com',
      name: 'Test User',
      address: {
        city: 'Test City',
        country: 'US',
        line1: '123 Test St',
        line2: null,
        postal_code: '12345',
        state: 'CA',
      },
    },
  } as unknown as Stripe.Checkout.Session;

  const mockSubscription = {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days from now
    items: {
      data: [
        {
          price: {
            product: 'prod_123',
          },
        },
      ],
    },
    metadata: {},
  } as unknown as Stripe.Subscription;

  const mockInvoice = {
    id: 'in_123',
    subscription: 'sub_123',
    status: 'paid',
  } as unknown as Stripe.Invoice;

  beforeEach(() => {
    mockStripe = {
      checkout: {
        sessions: {
          retrieve: jest.fn(),
        },
      },
      products: {
        retrieve: jest.fn(),
      },
      customers: {
        retrieve: jest.fn(),
      },
      paymentIntents: {
        retrieve: jest.fn(),
        update: jest.fn(),
      },
      subscriptions: {
        update: jest.fn(),
        retrieve: jest.fn(),
      },
      invoices: {
        retrieve: jest.fn(),
      },
    } as unknown as jest.Mocked<Stripe>;

    prismaMock.$transaction.mockImplementation(
      async (callback) => await callback(prismaMock),
    );

    prismaMock.customer.upsert.mockResolvedValue({
      id: 'cust_123',
      email: 'test@example.com',
    } as any);

    prismaMock.license.create.mockResolvedValue({
      id: 'license_123',
      licenseKey: 'encrypted-license-key',
      teamId: mockTeam.id,
      team: { name: 'Test Team' },
      products: [{ name: 'Test Product' }],
    } as any);

    prismaMock.product.findUnique.mockResolvedValue({
      id: 'prod_123',
      name: 'Test Product',
    } as any);

    (mockStripe.checkout.sessions.retrieve as jest.Mock).mockResolvedValue({
      id: mockSession.id,
      line_items: {
        data: [
          {
            price: {
              id: 'price_123',
              type: 'one_time',
              product: 'prod_123',
            },
          },
        ],
      },
    });

    (mockStripe.products.retrieve as jest.Mock).mockResolvedValue({
      id: 'prod_123',
      metadata: {
        product_id: '123e4567-e89b-12d3-a456-426614174000',
        ip_limit: '5',
        hwidLimit: '10',
        expiration_days: '365',
        expiration_start: 'CREATION',
      },
    });

    (mockStripe.customers.retrieve as jest.Mock).mockResolvedValue({
      deleted: false,
    });

    (mockStripe.invoices.retrieve as jest.Mock).mockResolvedValue({
      id: 'in_123',
      status: 'paid',
    });

    (mockStripe.paymentIntents.retrieve as jest.Mock).mockResolvedValue({
      id: 'pi_123',
      metadata: {},
    });

    (generateUniqueLicense as jest.Mock).mockResolvedValue('test-license-key');
    (generateHMAC as jest.Mock).mockReturnValue('test-hmac');
    (encryptLicenseKey as jest.Mock).mockReturnValue('encrypted-license-key');
    (sendLicenseDistributionEmail as jest.Mock).mockResolvedValue(true);

    (mockStripe.subscriptions.retrieve as jest.Mock).mockResolvedValue({
      ...mockSubscription,
    });
  });

  describe('handleCheckoutSessionCompleted', () => {
    test('successfully processes a valid checkout session', async () => {
      const createdLicense = {
        id: 'license_123',
        licenseKey: 'encrypted-license-key',
        teamId: mockTeam.id,
        team: { name: 'Test Team' },
        products: [{ name: 'Test Product' }],
      };

      prismaMock.license.create.mockResolvedValue(createdLicense as any);

      const result = await handleCheckoutSessionCompleted(
        'test-request-id',
        mockSession,
        mockTeam,
        mockStripe,
      );

      expect(result).toBeDefined();
      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith(
        mockSession.payment_intent,
      );
      expect(mockStripe.checkout.sessions.retrieve).toHaveBeenCalledWith(
        mockSession.id,
        { expand: ['line_items'] },
      );
      expect(prismaMock.customer.upsert).toHaveBeenCalled();
      expect(prismaMock.license.create).toHaveBeenCalled();
      expect(sendLicenseDistributionEmail).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'handleCheckoutSessionCompleted: Stripe checkout session processed successfully',
        expect.any(Object),
      );
    });

    test('skips if license already exists for payment intent', async () => {
      (mockStripe.paymentIntents.retrieve as jest.Mock).mockResolvedValue({
        id: 'pi_123',
        metadata: {
          lukittu_license_id: 'existing_license',
        },
      });

      await handleCheckoutSessionCompleted(
        'test-request-id',
        mockSession,
        mockTeam,
        mockStripe,
      );

      expect(logger.info).toHaveBeenCalledWith(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - license already exists',
        expect.any(Object),
      );
      expect(prismaMock.license.create).not.toHaveBeenCalled();
    });

    test('skips processing when payment status is not paid', async () => {
      const unpaidSession = {
        ...mockSession,
        payment_status: 'unpaid',
      } as Stripe.Checkout.Session;

      await handleCheckoutSessionCompleted(
        'test-request-id',
        unpaidSession,
        mockTeam,
        mockStripe,
      );

      expect(mockStripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - invalid payment status or mode',
        {
          requestId: 'test-request-id',
          teamId: mockTeam.id,
          sessionId: unpaidSession.id,
          paymentStatus: 'unpaid',
          mode: 'payment',
        },
      );
    });

    it('should skip if product not found from database', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null);

      await handleCheckoutSessionCompleted(
        'test-request-id',
        mockSession,
        mockTeam,
        mockStripe,
      );

      expect(logger.info).toHaveBeenCalledWith(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - product not found',
        {
          requestId: 'test-request-id',
          teamId: 'team-123',
          sessionId: 'cs_test_123',
          productId: '123e4567-e89b-12d3-a456-426614174000',
        },
      );
      expect(prismaMock.license.update).not.toHaveBeenCalled();
    });

    test('skips processing when customer email is missing', async () => {
      const sessionWithoutEmail = {
        ...mockSession,
        customer_details: { name: 'Test User' },
      } as unknown as Stripe.Checkout.Session;

      await handleCheckoutSessionCompleted(
        'test-request-id',
        sessionWithoutEmail,
        mockTeam,
        mockStripe,
      );

      expect(mockStripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - no customer email',
        {
          requestId: 'test-request-id',
          teamId: 'team-123',
          sessionId: 'cs_test_123',
        },
      );
    });

    test('handles invalid product metadata', async () => {
      (mockStripe.products.retrieve as jest.Mock).mockResolvedValue({
        id: 'prod_123',
        metadata: {
          product_id: 'invalid-uuid',
        },
      });

      await handleCheckoutSessionCompleted(
        'test-request-id',
        mockSession,
        mockTeam,
        mockStripe,
      );

      expect(logger.info).toHaveBeenCalledWith(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - invalid product ID',
        {
          requestId: 'test-request-id',
          teamId: 'team-123',
          sessionId: 'cs_test_123',
          productId: 'invalid-uuid',
        },
      );
      expect(prismaMock.customer.upsert).not.toHaveBeenCalled();
    });

    test('handles invalid expiration configuration', async () => {
      (mockStripe.products.retrieve as jest.Mock).mockResolvedValue({
        id: 'prod_123',
        metadata: {
          product_id: '123e4567-e89b-12d3-a456-426614174000',
          expiration_start: 'ACTIVATION',
        },
      });

      await handleCheckoutSessionCompleted(
        'test-request-id',
        mockSession,
        mockTeam,
        mockStripe,
      );

      expect(logger.info).toHaveBeenCalledWith(
        'handleCheckoutSessionCompleted: Stripe checkout skipped - expiration start without days',
        {
          requestId: 'test-request-id',
          teamId: 'team-123',
          sessionId: 'cs_test_123',
          expirationStart: 'ACTIVATION',
        },
      );
      expect(prismaMock.customer.upsert).not.toHaveBeenCalled();
    });

    test('handles license generation failure', async () => {
      (generateUniqueLicense as jest.Mock).mockResolvedValue(null);

      await expect(
        handleCheckoutSessionCompleted(
          'test-request-id',
          mockSession,
          mockTeam,
          mockStripe,
        ),
      ).rejects.toThrow('Failed to generate a unique license key');

      expect(logger.error).toHaveBeenCalledWith(
        'handleCheckoutSessionCompleted: Failed to generate a unique license key',
      );
      expect(prismaMock.license.create).not.toHaveBeenCalled();
    });

    test('handles database transaction error', async () => {
      const error = new Error('Database error');
      prismaMock.$transaction.mockRejectedValue(error);

      await expect(
        handleCheckoutSessionCompleted(
          'test-request-id',
          mockSession,
          mockTeam,
          mockStripe,
        ),
      ).rejects.toThrow('Database error');

      expect(logger.error).toHaveBeenCalledWith(
        'handleCheckoutSessionCompleted: Stripe checkout session processing failed',
        {
          requestId: 'test-request-id',
          teamId: mockTeam.id,
          sessionId: mockSession.id,
          paymentIntentId: mockSession.payment_intent,
          error: 'Database error',
          errorType: 'Error',
          handlerTimeMs: expect.any(Number),
        },
      );
    });
  });

  describe('handleInvoicePaid', () => {
    test('successfully creates a license for subscription_create', async () => {
      const invoice = {
        ...mockInvoice,
        billing_reason: 'subscription_create' as Stripe.Invoice.BillingReason,
      };

      const subscriptionWithCustomer = {
        ...mockSubscription,
        customer: 'cus_123',
        metadata: {}, // Ensure no existing license
      };

      (mockStripe.subscriptions.retrieve as jest.Mock).mockResolvedValue(
        subscriptionWithCustomer,
      );

      (mockStripe.customers.retrieve as jest.Mock).mockResolvedValue({
        id: 'cus_123',
        email: 'subscription@example.com',
        name: 'Subscription Customer',
        deleted: false,
      });

      (mockStripe.products.retrieve as jest.Mock).mockResolvedValue({
        id: 'prod_123',
        metadata: {
          product_id: '123e4567-e89b-12d3-a456-426614174000',
          ip_limit: '5',
          hwidLimit: '10',
        },
      });

      prismaMock.product.findUnique.mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Product',
      } as any);

      const createdLicense = {
        id: 'subscription_license_123',
        expirationDate: new Date(),
      };

      prismaMock.license.create.mockResolvedValue(createdLicense as any);

      prismaMock.$transaction.mockImplementation(async (callback) => {
        await callback(prismaMock);
        return createdLicense;
      });

      const result = await handleInvoicePaid(
        'test-request-id',
        invoice,
        mockTeam,
        mockStripe,
      );

      expect(result).toBeDefined();
      expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123');
      expect(prismaMock.license.create).toHaveBeenCalled();
      expect(mockStripe.subscriptions.update).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'handleInvoicePaid: License created for subscription',
        expect.any(Object),
      );
    });

    test('successfully updates license for subscription_cycle', async () => {
      const invoice = {
        ...mockInvoice,
        billing_reason: 'subscription_cycle' as Stripe.Invoice.BillingReason,
      };

      const updatedLicense = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        expirationDate: new Date(),
      };

      (mockStripe.subscriptions.retrieve as jest.Mock).mockResolvedValue({
        ...mockSubscription,
        metadata: {
          lukittu_license_id: '123e4567-e89b-12d3-a456-426614174000',
        },
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
      });

      prismaMock.license.findUnique.mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
      } as any);

      prismaMock.license.update.mockResolvedValue(updatedLicense as any);

      const result = await handleInvoicePaid(
        'test-request-id',
        invoice,
        mockTeam,
        mockStripe,
      );

      expect(result).toBeDefined();
      expect(result).toEqual(updatedLicense);
      expect(prismaMock.license.update).toHaveBeenCalledWith({
        where: { id: '123e4567-e89b-12d3-a456-426614174000' },
        data: {
          expirationDate: expect.any(Date),
        },
      });
    });

    test('skips if no billing reason', async () => {
      const invoice = {
        ...mockInvoice,
        billing_reason: null,
      };

      await handleInvoicePaid('test-request-id', invoice, mockTeam, mockStripe);

      expect(logger.info).toHaveBeenCalledWith(
        'handleInvoicePaid: Stripe invoice skipped - no billing reason',
        {
          requestId: 'test-request-id',
          teamId: mockTeam.id,
          invoiceId: invoice.id,
        },
      );
    });

    test('skips if no subscription ID', async () => {
      const invoice = {
        ...mockInvoice,
        billing_reason: 'manual' as Stripe.Invoice.BillingReason,
        subscription: null,
      };

      await handleInvoicePaid('test-request-id', invoice, mockTeam, mockStripe);

      expect(logger.info).toHaveBeenCalledWith(
        'handleInvoicePaid: Stripe invoice skipped - not a subscription invoice',
        {
          requestId: 'test-request-id',
          teamId: mockTeam.id,
          invoiceId: invoice.id,
          billingReason: invoice.billing_reason,
          subscriptionId: invoice.subscription,
        },
      );
    });

    test('skips if license already exists for subscription_create', async () => {
      const invoice = {
        ...mockInvoice,
        billing_reason: 'subscription_create' as Stripe.Invoice.BillingReason,
      };

      (mockStripe.subscriptions.retrieve as jest.Mock).mockResolvedValue({
        ...mockSubscription,
        metadata: { lukittu_license_id: 'existing_license' },
      });

      await handleInvoicePaid('test-request-id', invoice, mockTeam, mockStripe);

      expect(logger.info).toHaveBeenCalledWith(
        'handleInvoicePaid: Stripe invoice skipped - license already exists',
        {
          requestId: 'test-request-id',
          teamId: mockTeam.id,
          subscriptionId: mockSubscription.id,
          licenseId: 'existing_license',
        },
      );
    });

    test('skips if customer is deleted', async () => {
      const invoice = {
        ...mockInvoice,
        billing_reason: 'subscription_create' as Stripe.Invoice.BillingReason,
      };

      (mockStripe.customers.retrieve as jest.Mock).mockResolvedValue({
        deleted: true,
      });

      await handleInvoicePaid('test-request-id', invoice, mockTeam, mockStripe);

      expect(logger.info).toHaveBeenCalledWith(
        'handleInvoicePaid: Stripe invoice skipped - customer not found or deleted',
        {
          requestId: 'test-request-id',
          teamId: 'team-123',
          customerId: 'cus_123',
        },
      );
      expect(prismaMock.license.create).not.toHaveBeenCalled();
    });

    test('handles database error gracefully', async () => {
      const invoice = {
        ...mockInvoice,
        billing_reason: 'subscription_create' as Stripe.Invoice.BillingReason,
      };

      const error = new Error('Database error');
      prismaMock.$transaction.mockRejectedValue(error);

      await expect(
        handleInvoicePaid('test-request-id', invoice, mockTeam, mockStripe),
      ).rejects.toThrow('Database error');

      expect(logger.error).toHaveBeenCalledWith(
        'handleInvoicePaid: Stripe invoice processing failed',
        {
          requestId: 'test-request-id',
          teamId: mockTeam.id,
          invoiceId: invoice.id,
          subscriptionId: invoice.subscription,
          error: 'Database error',
          errorType: 'Error',
          handlerTimeMs: expect.any(Number),
        },
      );
    });
  });

  describe('handleSubscriptionDeleted', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('successfully expires license', async () => {
      const subscription = {
        ...mockSubscription,
        metadata: {
          lukittu_license_id: '123e4567-e89b-12d3-a456-426614174000',
        }, // Valid UUID
      };

      const updatedLicense = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        expirationDate: new Date(),
      };

      prismaMock.license.findUnique.mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
      } as any);

      prismaMock.license.update.mockResolvedValue(updatedLicense as any);

      await handleSubscriptionDeleted(
        'test-request-id',
        subscription,
        mockTeam,
      );

      expect(prismaMock.license.update).toHaveBeenCalledWith({
        where: { id: '123e4567-e89b-12d3-a456-426614174000' },
        data: {
          expirationDate: expect.any(Date),
        },
      });
    });

    test('skips if no license ID in metadata', async () => {
      await handleSubscriptionDeleted(
        'test-request-id',
        mockSubscription,
        mockTeam,
      );

      expect(logger.info).toHaveBeenCalledWith(
        'handleSubscriptionDeleted: Stripe subscription deletion skipped - no license ID',
        {
          requestId: 'test-request-id',
          teamId: mockTeam.id,
          subscriptionId: mockSubscription.id,
          metadata: mockSubscription.metadata,
        },
      );
    });

    test('skips if license not found', async () => {
      const subscription = {
        ...mockSubscription,
        metadata: {
          lukittu_license_id: '123e4567-e89b-12d3-a456-426614174000',
        },
      };

      prismaMock.license.findUnique.mockResolvedValue(null);

      await handleSubscriptionDeleted(
        'test-request-id',
        subscription,
        mockTeam,
      );

      expect(logger.info).toHaveBeenCalledWith(
        'handleSubscriptionDeleted: Stripe subscription deletion skipped - license not found',
        {
          requestId: 'test-request-id',
          teamId: 'team-123',
          subscriptionId: subscription.id,
          licenseId: '123e4567-e89b-12d3-a456-426614174000',
        },
      );
    });

    test('handles errors gracefully', async () => {
      const error = new Error('Update failed');
      const subscription = {
        ...mockSubscription,
        metadata: {
          lukittu_license_id: '123e4567-e89b-12d3-a456-426614174000',
        },
      };

      prismaMock.license.findUnique.mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
      } as any);

      prismaMock.license.update.mockRejectedValue(error);

      await expect(
        handleSubscriptionDeleted('test-request-id', subscription, mockTeam),
      ).rejects.toThrow('Update failed');

      expect(logger.error).toHaveBeenCalledWith(
        'handleSubscriptionDeleted: Stripe subscription deletion failed',
        {
          requestId: 'test-request-id',
          teamId: mockTeam.id,
          subscriptionId: subscription.id,
          error: 'Update failed',
          errorType: 'Error',
          handlerTimeMs: expect.any(Number),
        },
      );
    });
  });
});
