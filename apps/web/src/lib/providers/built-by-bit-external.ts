import { HttpStatus } from '@/types/http-status';
import {
  attemptWebhookDelivery,
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  BuiltByBitIntegration,
  createCustomerPayload,
  createLicensePayload,
  createWebhookEvents,
  decryptLicenseKey,
  encryptLicenseKey,
  generateHMAC,
  generateUniqueLicense,
  Limits,
  logger,
  prisma,
  Settings,
  Team,
  updateCustomerPayload,
  WebhookEventType,
} from '@lukittu/shared';
import { BuiltByBitMetadataKeys } from '../constants/metadata';
import { createAuditLog } from '../logging/audit-log';
import { PlaceholderBuiltByBitSchema } from '../validation/integrations/placeholder-built-by-bit-schema';
import { PurchaseBuiltByBitSchema } from '../validation/integrations/purchase-built-by-bit-schema';

type ExtendedTeam = Team & {
  settings: Settings | null;
  limits: Limits | null;
  builtByBitIntegration: BuiltByBitIntegration | null;
  _count: {
    licenses: number;
    customers: number;
  };
};

type BuiltByBitPurchaseResult = {
  success: boolean;
  message: string;
};

export const handleBuiltByBitPurchase = async (
  builtByBitData: PurchaseBuiltByBitSchema['builtByBitData'],
  lukittuData: PurchaseBuiltByBitSchema['lukittuData'],
  team: ExtendedTeam,
): Promise<BuiltByBitPurchaseResult> => {
  try {
    const { resource: bbbResource, user: bbbUser } = builtByBitData;
    const { productId, hwidLimit, expirationStart, expirationDays, ipLimit } =
      lukittuData;

    logger.info('Processing BuiltByBit purchase', {
      teamId: team.id,
      bbbResourceId: bbbResource.id,
      bbbResourceTitle: bbbResource.title,
      bbbUserId: bbbUser.id,
      bbbUsername: bbbUser.username,
      lukittuProductId: productId,
    });

    // BuiltByBit doesn't send any unique identifier for the purchase
    // so we generate a unique ID to ensure that this won't be duplicated.
    const purchaseId = generateHMAC(
      `${bbbResource.id}:${bbbUser.id}:${bbbResource.purchaseDate}:${team.id}`,
    );

    const existingPurchase = await prisma.license.findFirst({
      where: {
        teamId: team.id,
        metadata: {
          some: {
            key: BuiltByBitMetadataKeys.BBB_PURCHASE_ID,
            value: purchaseId,
          },
        },
      },
    });

    if (existingPurchase) {
      logger.info('Skipping: Purchase already processed', {
        purchaseId,
        teamId: team.id,
        bbbResourceId: bbbResource.id,
        bbbUserId: bbbUser.id,
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
        bbbResourceId: bbbResource.id,
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
        key: BuiltByBitMetadataKeys.BBB_USER_ID,
        value: bbbUser.id,
        locked: true,
      },
      {
        key: BuiltByBitMetadataKeys.BBB_RESOURCE_ID,
        value: bbbResource.id,
        locked: true,
      },
      {
        key: BuiltByBitMetadataKeys.BBB_PURCHASE_ID,
        value: purchaseId,
        locked: true,
      },
      ...(bbbResource.addon.id && bbbResource.addon.id !== '0'
        ? [
            {
              key: BuiltByBitMetadataKeys.BBB_ADDON_ID,
              value: bbbResource.addon.id,
              locked: true,
            },
          ]
        : []),
    ];

    const webhookEventIds: string[] = [];

    const license = await prisma.$transaction(async (prisma) => {
      const existingLukittuCustomer = await prisma.customer.findFirst({
        where: {
          metadata: {
            some: {
              key: BuiltByBitMetadataKeys.BBB_USER_ID,
              value: bbbUser.id,
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
          username: bbbUser.username,
          teamId: team.id,
          metadata: {
            create: {
              key: BuiltByBitMetadataKeys.BBB_USER_ID,
              value: bbbUser.id,
              locked: true,
              teamId: team.id,
            },
          },
        },
        update: {
          username: bbbUser.username,
        },
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
          username: bbbUser.username,
          metadata: metadata.map((m) => ({
            key: m.key,
            value: m.value,
            locked: m.locked,
          })),
        },
        responseBody: { customer: lukittuCustomer },
        source: AuditLogSource.BUILT_BY_BIT_INTEGRATION,
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
        source: AuditLogSource.BUILT_BY_BIT_INTEGRATION,
        tx: prisma,
      });

      webhookEventIds.push(...customerWebhookEvents);

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
          ipLimit,
          hwidLimit,
          expirationType: expirationDays ? 'DURATION' : 'NEVER',
          expirationDays: expirationDays || null,
          expirationStart: expirationStartFormatted,
          expirationDate,
        },
        include: {
          customers: true,
          products: true,
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
        source: AuditLogSource.BUILT_BY_BIT_INTEGRATION,
        tx: prisma,
      });

      const licenseWebhookEvents = await createWebhookEvents({
        eventType: WebhookEventType.LICENSE_CREATED,
        teamId: team.id,
        payload: createLicensePayload(license),
        source: AuditLogSource.BUILT_BY_BIT_INTEGRATION,
        tx: prisma,
      });

      webhookEventIds.push(...licenseWebhookEvents);

      return license;
    });

    if (!license) {
      logger.error('Failed to create a license', {
        teamId: team.id,
        bbbResourceId: bbbResource.id,
        bbbUserId: bbbUser.id,
      });
      return {
        success: false,
        message: 'Failed to create a license',
      };
    }

    void attemptWebhookDelivery(webhookEventIds);

    logger.info('BuiltByBit purchase processed successfully', {
      licenseId: license.id,
      teamId: team.id,
      productId,
      bbbResourceId: bbbResource.id,
      bbbResourceTitle: bbbResource.title,
      bbbUserId: bbbUser.id,
      bbbUsername: bbbUser.username,
      hwidLimit: hwidLimit || null,
      ipLimit: ipLimit || null,
      expirationDays: expirationDays || null,
      expirationStart: expirationStartFormatted,
      addonId: bbbResource.addon?.id,
      addonTitle: bbbResource.addon?.title,
    });

    return {
      success: true,
      message: 'Purchase processed successfully',
    };
  } catch (error) {
    logger.error('Error occurred in handleBuiltByBitPurchase', {
      error,
      builtByBitData,
      lukittuData,
      teamId: team.id,
    });
    return {
      success: false,
      message: 'An error occurred while processing the purchase',
    };
  }
};

export const handleBuiltByBitPlaceholder = async (
  validatedData: PlaceholderBuiltByBitSchema,
  teamId: string,
) => {
  try {
    logger.info('Processing BuiltByBit placeholder request', {
      teamId,
      steamId: validatedData.steam_id,
      userId: validatedData.user_id,
      resourceId: validatedData.resource_id,
      versionId: validatedData.version_id,
    });

    const licenseKey = await prisma.license.findFirst({
      where: {
        teamId,
        AND: [
          {
            metadata: {
              some: {
                key: BuiltByBitMetadataKeys.BBB_USER_ID,
                value: validatedData.user_id,
              },
            },
          },
          {
            metadata: {
              some: {
                key: BuiltByBitMetadataKeys.BBB_RESOURCE_ID,
                value: validatedData.resource_id,
              },
            },
          },
        ],
      },
    });

    if (!licenseKey) {
      logger.error('License key not found for BuiltByBit user', {
        teamId,
        userId: validatedData.user_id,
        resourceId: validatedData.resource_id,
      });
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'License key not found',
      };
    }

    logger.info('License key found for BuiltByBit placeholder', {
      teamId,
      userId: validatedData.user_id,
      resourceId: validatedData.resource_id,
      licenseId: licenseKey.id,
    });

    const decryptedKey = decryptLicenseKey(licenseKey.licenseKey);

    await createAuditLog({
      teamId,
      action: AuditLogAction.SET_BUILT_BY_BIT_PLACEHOLDER,
      targetId: licenseKey.id,
      targetType: AuditLogTargetType.LICENSE,
      requestBody: validatedData,
      responseBody: {
        licenseKey: decryptedKey,
      },
      source: AuditLogSource.BUILT_BY_BIT_INTEGRATION,
    });

    return {
      success: true,
      licenseKey: decryptedKey,
    };
  } catch (error) {
    logger.error('Error handling BuiltByBit placeholder', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      teamId,
    });
    throw error;
  }
};
