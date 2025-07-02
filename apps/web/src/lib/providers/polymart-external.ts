import { HttpStatus } from '@/types/http-status';
import {
  attemptWebhookDelivery,
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  createWebhookEvents,
  decryptLicenseKey,
  encryptLicenseKey,
  generateHMAC,
  generateUniqueLicense,
  Limits,
  logger,
  PolymartIntegration,
  prisma,
  Settings,
  Team,
  WebhookEventType,
} from '@lukittu/shared';
import { createLicensePayload } from '@lukittu/shared/dist/src/webhooks/payloads/create-license-payloads';
import crypto from 'crypto';
import { PolymartMetadataKeys } from '../constants/metadata';
import { createAuditLog } from '../logging/audit-log';
import { PlaceholderPolymartSchema } from '../validation/integrations/placeholder-polymart-schema';
import {
  PolymartPurchaseParams,
  PurchasePolymartSchema,
} from '../validation/integrations/purchase-polymart-schema';

type ExtendedTeam = Team & {
  settings: Settings | null;
  limits: Limits | null;
  polymartIntegration: PolymartIntegration | null;
  _count: {
    licenses: number;
    customers: number;
  };
};

type PolymartPurchaseResult = {
  success: boolean;
  message: string;
};

interface PolymartUserResponse {
  request: {
    action: string;
    time: number;
    cache: number;
  };
  response: {
    success: boolean;
    user?: {
      id: number;
      username: string;
      discord_id?: number;
      profile_picture_updated?: number;
      type: string;
      profilePictureURL?: string;
      statistics?: {
        resourceCount: number;
        resourceDownloads: number;
        resourceRatings: number;
        resourceAverageRating: number;
      };
    };
    error?: string;
  };
}

export const verifyPolymartSignature = (
  payload: string,
  signature: string,
  webhookSecret: string,
): boolean => {
  try {
    const hmac = crypto.createHmac('sha256', webhookSecret);
    const digest = hmac.update(payload).digest('hex');

    if (!/^[a-f0-9]{64}$/i.test(signature)) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(digest, 'hex'),
      Buffer.from(signature, 'hex'),
    );
  } catch {
    return false;
  }
};

const getPolymartUsername = async (userId: number): Promise<string | null> => {
  try {
    const response = await fetch(
      `https://api.polymart.org/v1/getAccountInfo?user_id=${userId}`,
    );

    if (!response.ok) {
      logger.info(
        'Failed to get Polymart username, API returned unsuccessful status',
        {
          userId,
          status: response.status,
        },
      );
      return null;
    }

    const data: PolymartUserResponse = await response.json();

    if (data.response.success && data.response.user) {
      return data.response.user.username;
    }

    logger.info(
      'Failed to get Polymart username, API returned unsuccessful response',
      {
        userId,
        response: data,
      },
    );
    return null;
  } catch (error) {
    logger.error('Error fetching Polymart username', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const handlePolymartPurchase = async (
  polymartData: PurchasePolymartSchema,
  purchaseParams: PolymartPurchaseParams,
  team: ExtendedTeam,
): Promise<PolymartPurchaseResult> => {
  try {
    const { product, user } = polymartData.payload;
    const { productId, seats, expirationStart, expirationDays, ipLimit } =
      purchaseParams;

    logger.info('Processing Polymart purchase', {
      teamId: team.id,
      polymartProductId: product.id,
      polymartProductTitle: product.title,
      polymartUserId: user.id,
      lukittuProductId: productId,
    });

    // Generate a unique purchase ID based on Polymart data
    const purchaseId = generateHMAC(
      `${product.id}:${user.id}:${polymartData.time}:${team.id}`,
    );

    const existingPurchase = await prisma.license.findFirst({
      where: {
        teamId: team.id,
        metadata: {
          some: {
            key: PolymartMetadataKeys.POLYMART_PURCHASE_ID,
            value: purchaseId,
          },
        },
      },
    });

    if (existingPurchase) {
      logger.info('Skipping: Purchase already processed', {
        purchaseId,
        teamId: team.id,
        polymartProductId: product.id,
        polymartUserId: user.id,
      });
      return {
        success: true,
        message: 'Purchase already processed',
      };
    }

    const productExists = await prisma.product.findUnique({
      where: {
        teamId: team.id,
        id: productId,
      },
    });

    if (!productExists) {
      logger.error('Product not found in database', {
        teamId: team.id,
        productId,
        polymartProductId: product.id,
      });
      return {
        success: false,
        message: 'Product not found',
      };
    }

    if (team._count.licenses >= (team.limits?.maxLicenses ?? 0)) {
      logger.error('Team has reached the maximum number of licenses', {
        teamId: team.id,
        currentLicenses: team._count.licenses,
        maxLicenses: team.limits?.maxLicenses,
      });
      return {
        success: false,
        message: 'Team has reached the maximum number of licenses',
      };
    }

    if (team._count.customers >= (team.limits?.maxCustomers ?? 0)) {
      logger.error('Team has reached the maximum number of customers', {
        teamId: team.id,
        currentCustomers: team._count.customers,
        maxCustomers: team.limits?.maxCustomers,
      });
      return {
        success: false,
        message: 'Team has reached the maximum number of customers',
      };
    }

    const expirationStartFormatted =
      expirationStart?.toUpperCase() === 'ACTIVATION'
        ? 'ACTIVATION'
        : 'CREATION';
    const expirationDate =
      (!expirationStart || expirationStart.toUpperCase() === 'CREATION') &&
      expirationDays
        ? new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000)
        : null;

    const metadata = [
      {
        key: PolymartMetadataKeys.POLYMART_USER_ID,
        value: user.id.toString(),
        locked: true,
      },
      {
        key: PolymartMetadataKeys.POLYMART_PRODUCT_ID,
        value: product.id,
        locked: true,
      },
      {
        key: PolymartMetadataKeys.POLYMART_PURCHASE_ID,
        value: purchaseId,
        locked: true,
      },
    ];

    const polymartUsername = await getPolymartUsername(user.id);

    if (!polymartUsername) {
      logger.error('Failed to fetch Polymart username', {
        userId: user.id,
        productId: product.id,
        teamId: team.id,
      });

      return {
        success: false,
        message: 'Failed to retrieve Polymart username',
      };
    }

    const username = polymartUsername;

    let webhookEventIds: string[] = [];

    const license = await prisma.$transaction(async (prisma) => {
      const existingLukittuCustomer = await prisma.customer.findFirst({
        where: {
          metadata: {
            some: {
              key: PolymartMetadataKeys.POLYMART_USER_ID,
              value: user.id.toString(),
            },
          },
          teamId: team.id,
        },
      });

      const lukittuCustomer = await prisma.customer.upsert({
        where: {
          id: existingLukittuCustomer?.id || '',
          teamId: team.id,
        },
        create: {
          username,
          teamId: team.id,
          metadata: {
            create: {
              key: PolymartMetadataKeys.POLYMART_USER_ID,
              value: user.id.toString(),
              locked: true,
              teamId: team.id,
            },
          },
        },
        update: {
          username,
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
          username,
          metadata: metadata.map((m) => ({
            key: m.key,
            value: m.value,
            locked: m.locked,
          })),
        },
        responseBody: { customer: lukittuCustomer },
        source: AuditLogSource.POLYMART_INTEGRATION,
        tx: prisma,
      });

      const licenseKey = await generateUniqueLicense(team.id);
      const hmac = generateHMAC(`${licenseKey}:${team.id}`);

      if (!licenseKey) {
        logger.error('Failed to generate a unique license key');
        return null;
      }

      const encryptedLicenseKey = encryptLicenseKey(licenseKey);

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
              id: productId,
            },
          },
          ipLimit: ipLimit || null,
          seats: seats || null,
          expirationType: expirationDays ? 'DURATION' : 'NEVER',
          expirationDays: expirationDays || null,
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
          products: [productId],
          metadata: metadata.map((m) => ({
            key: m.key,
            value: m.value,
            locked: m.locked,
          })),
          ipLimit,
          seats,
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
        source: AuditLogSource.POLYMART_INTEGRATION,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.LICENSE_CREATED,
        teamId: team.id,
        payload: createLicensePayload(license),
        source: AuditLogSource.POLYMART_INTEGRATION,
        tx: prisma,
      });

      return license;
    });

    if (!license) {
      logger.error('Failed to create a license', {
        teamId: team.id,
        polymartProductId: product.id,
        polymartUserId: user.id,
      });
      return {
        success: false,
        message: 'Failed to create a license',
      };
    }

    await attemptWebhookDelivery(webhookEventIds);

    logger.info('Polymart purchase processed successfully', {
      licenseId: license.id,
      teamId: team.id,
      productId,
      polymartProductId: product.id,
      polymartProductTitle: product.title,
      polymartUserId: user.id,
      username,
      seats: seats || null,
      ipLimit: ipLimit || null,
      expirationDays: expirationDays || null,
      expirationStart: expirationStartFormatted,
    });

    return {
      success: true,
      message: 'Purchase processed successfully',
    };
  } catch (error) {
    logger.error('Error occurred in handlePolymartPurchase', {
      error,
      polymartData,
      purchaseParams,
      teamId: team.id,
    });
    return {
      success: false,
      message: 'An error occurred while processing the purchase',
    };
  }
};

export const handlePolymartPlaceholder = async (
  validatedData: PlaceholderPolymartSchema,
  teamId: string,
) => {
  try {
    // Check if the timestamp is within 5 minutes (300 seconds) to prevent replay attacks
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - validatedData.time) > 300) {
      logger.error('Polymart placeholder request timestamp out of range', {
        teamId,
        timestamp: validatedData.time,
        currentTime: now,
        difference: Math.abs(now - validatedData.time),
      });
      return {
        status: HttpStatus.BAD_REQUEST,
        message: {
          message: 'Request timestamp is out of allowed range',
        },
      };
    }

    logger.info('Processing Polymart placeholder request', {
      teamId,
      userId: validatedData.user,
      productId: validatedData.product,
      placeholder: validatedData.placeholder,
    });

    const licenseKey = await prisma.license.findFirst({
      where: {
        teamId,
        AND: [
          {
            metadata: {
              some: {
                key: PolymartMetadataKeys.POLYMART_USER_ID,
                value: validatedData.user.toString(),
              },
            },
          },
          {
            metadata: {
              some: {
                key: PolymartMetadataKeys.POLYMART_PRODUCT_ID,
                value: validatedData.product.toString(),
              },
            },
          },
        ],
      },
    });

    if (!licenseKey) {
      logger.error('License key not found for Polymart user', {
        teamId,
        userId: validatedData.user,
        productId: validatedData.product,
      });
      return {
        status: HttpStatus.NOT_FOUND,
        message: {
          message: 'No license key found',
        },
      };
    }

    logger.info('License key found for Polymart placeholder', {
      teamId,
      userId: validatedData.user,
      productId: validatedData.product,
      licenseId: licenseKey.id,
    });

    const decryptedKey = decryptLicenseKey(licenseKey.licenseKey);

    await createAuditLog({
      teamId,
      action: AuditLogAction.SET_POLYMART_PLACEHOLDER,
      targetId: licenseKey.id,
      targetType: AuditLogTargetType.LICENSE,
      requestBody: validatedData,
      responseBody: {
        licenseKey: decryptedKey,
      },
      source: AuditLogSource.POLYMART_INTEGRATION,
    });

    return {
      success: true,
      value: decryptedKey,
    };
  } catch (error) {
    logger.error('Error occurred in handlePolymartPlaceholder', {
      error,
      userId: validatedData.user,
      productId: validatedData.product,
      teamId,
    });
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: {
        message: 'An error occurred while processing the placeholder',
      },
    };
  }
};
