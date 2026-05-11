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
  decryptString,
  encryptString,
  generateHMAC,
  generateUniqueLicense,
  Limits,
  logger,
  Prisma,
  prisma,
  Settings,
  Team,
  updateCustomerPayload,
  WebhookEventType,
} from '@lukittu/shared';
import { after } from 'next/server';
import 'server-only';
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

// The advisory lock + customer upsert + audit log + webhook event inserts can
// occasionally exceed Prisma's 5s interactive-transaction default under load.
const TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 } as const;

enum TxOutcome {
  Duplicate = 'duplicate',
  LimitLicenses = 'limit-licenses',
  LimitCustomers = 'limit-customers',
  GenerationFailed = 'generation-failed',
  Success = 'success',
  Ready = 'ready',
}

/**
 * Serializes any placeholder/purchase work for the same (team, bbb user) pair
 * via a PostgreSQL advisory lock held for the duration of the surrounding
 * transaction. Without this, a placeholder request and a purchase webhook
 * firing concurrently could each create their own license for the same
 * purchase. Locking on the user (not user+resource) also serializes customer
 * upserts, so two concurrent purchases for the same BBB user can't both
 * insert duplicate Customer rows.
 */
const acquireBuiltByBitLock = async (
  tx: Prisma.TransactionClient,
  teamId: string,
  bbbUserId: string,
) => {
  const lockKey = `bbb:${teamId}:${bbbUserId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;
};

export const handleBuiltByBitPurchase = async (
  requestId: string,
  builtByBitData: PurchaseBuiltByBitSchema['builtByBitData'],
  lukittuData: PurchaseBuiltByBitSchema['lukittuData'],
  team: ExtendedTeam,
): Promise<BuiltByBitPurchaseResult> => {
  const handlerStartTime = Date.now();

  try {
    const { resource: bbbResource, user: bbbUser } = builtByBitData;
    const { productId, hwidLimit, expirationStart, expirationDays, ipLimit } =
      lukittuData;

    logger.info('handleBuiltByBitPurchase: Processing Built-by-bit purchase', {
      requestId,
      teamId: team.id,
      bbbResourceId: bbbResource.id,
      bbbResourceTitle: bbbResource.title,
      bbbUserId: bbbUser.id,
      bbbUsername: bbbUser.username,
      lukittuProductId: productId,
      hwidLimit,
      ipLimit,
      expirationDays,
      expirationStart,
    });

    // BuiltByBit doesn't send any unique identifier for the purchase
    // so we generate a unique ID to ensure that this won't be duplicated.
    const purchaseId = generateHMAC(
      `${bbbResource.id}:${bbbUser.id}:${bbbResource.purchaseDate}:${team.id}`,
    );

    const productExists = await prisma.product.findUnique({
      where: {
        teamId: team.id,
        id: productId,
      },
    });

    if (!productExists) {
      logger.error(
        'handleBuiltByBitPurchase: Built-by-bit purchase failed - product not found',
        {
          requestId,
          teamId: team.id,
          productId,
          bbbResourceId: bbbResource.id,
        },
      );
      return {
        success: false,
        message: 'Product not found',
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

    const purchaseMetadata = [
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

    type TxResult =
      | { kind: TxOutcome.Duplicate }
      | { kind: TxOutcome.LimitLicenses }
      | { kind: TxOutcome.LimitCustomers }
      | { kind: TxOutcome.GenerationFailed }
      | { kind: TxOutcome.Success; licenseId: string; claimed: boolean };

    const txResult = await prisma.$transaction(
      async (tx): Promise<TxResult> => {
        await acquireBuiltByBitLock(tx, team.id, bbbUser.id);

        const existingPurchase = await tx.license.findFirst({
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
          return { kind: TxOutcome.Duplicate };
        }

        // Look for a placeholder license created by the download endpoint
        // that hasn't yet been claimed by a purchase webhook.
        const placeholderLicense = await tx.license.findFirst({
          where: {
            teamId: team.id,
            AND: [
              {
                metadata: {
                  some: {
                    key: BuiltByBitMetadataKeys.BBB_USER_ID,
                    value: bbbUser.id,
                  },
                },
              },
              {
                metadata: {
                  some: {
                    key: BuiltByBitMetadataKeys.BBB_RESOURCE_ID,
                    value: bbbResource.id,
                  },
                },
              },
              {
                metadata: {
                  some: {
                    key: BuiltByBitMetadataKeys.BBB_PLACEHOLDER,
                    value: 'true',
                  },
                },
              },
              {
                metadata: {
                  none: {
                    key: BuiltByBitMetadataKeys.BBB_PURCHASE_ID,
                  },
                },
              },
            ],
          },
        });

        // The license limit only needs to be re-checked when we're going to
        // create a fresh license. Claiming an existing placeholder doesn't
        // change the count.
        if (
          !placeholderLicense &&
          team._count.licenses >= (team.limits?.maxLicenses ?? 0)
        ) {
          return { kind: TxOutcome.LimitLicenses };
        }

        const existingLukittuCustomer = await tx.customer.findFirst({
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

        if (
          !existingLukittuCustomer &&
          team._count.customers >= (team.limits?.maxCustomers ?? 0)
        ) {
          return { kind: TxOutcome.LimitCustomers };
        }

        const lukittuCustomer = await tx.customer.upsert({
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
            metadata: [
              {
                key: BuiltByBitMetadataKeys.BBB_USER_ID,
                value: bbbUser.id,
                locked: true,
              },
            ],
          },
          responseBody: { customer: lukittuCustomer },
          source: AuditLogSource.BUILT_BY_BIT_INTEGRATION,
          tx,
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
          tx,
        });

        webhookEventIds.push(...customerWebhookEvents);

        let license;
        let plaintextLicenseKey: string;

        if (placeholderLicense) {
          // Claim path: promote the suspended placeholder into a real license.
          // Drop the BBB_PLACEHOLDER marker, attach product/customer, and stamp
          // the purchase metadata (purchase id, optional addon id).
          license = await tx.license.update({
            where: { id: placeholderLicense.id },
            data: {
              suspended: false,
              customers: {
                connect: { id: lukittuCustomer.id },
              },
              products: {
                connect: { id: productId },
              },
              ipLimit,
              hwidLimit,
              expirationType: expirationDays ? 'DURATION' : 'NEVER',
              expirationDays: expirationDays || null,
              expirationStart: expirationStartFormatted,
              expirationDate,
              metadata: {
                deleteMany: {
                  key: BuiltByBitMetadataKeys.BBB_PLACEHOLDER,
                },
                createMany: {
                  data: purchaseMetadata.map((m) => ({
                    ...m,
                    teamId: team.id,
                  })),
                },
              },
            },
            include: {
              customers: true,
              products: true,
              metadata: true,
            },
          });
          plaintextLicenseKey = decryptString(license.licenseKey);
        } else {
          const generatedKey = await generateUniqueLicense(team.id);

          if (!generatedKey) {
            return { kind: TxOutcome.GenerationFailed };
          }

          const hmac = generateHMAC(`${generatedKey}:${team.id}`);
          const encryptedLicenseKey = encryptString(generatedKey);
          plaintextLicenseKey = generatedKey;

          license = await tx.license.create({
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
                  data: [
                    {
                      key: BuiltByBitMetadataKeys.BBB_USER_ID,
                      value: bbbUser.id,
                      locked: true,
                      teamId: team.id,
                    },
                    {
                      key: BuiltByBitMetadataKeys.BBB_RESOURCE_ID,
                      value: bbbResource.id,
                      locked: true,
                      teamId: team.id,
                    },
                    ...purchaseMetadata.map((m) => ({
                      ...m,
                      teamId: team.id,
                    })),
                  ],
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
        }

        await createAuditLog({
          teamId: team.id,
          action: placeholderLicense
            ? AuditLogAction.UPDATE_LICENSE
            : AuditLogAction.CREATE_LICENSE,
          targetId: license.id,
          targetType: AuditLogTargetType.LICENSE,
          requestBody: {
            licenseKey: plaintextLicenseKey,
            teamId: team.id,
            customers: [lukittuCustomer.id],
            products: [productId],
            metadata: license.metadata.map((m) => ({
              key: m.key,
              value: m.value,
              locked: m.locked,
            })),
            ipLimit,
            hwidLimit,
            expirationType: expirationDays ? 'DURATION' : 'NEVER',
            expirationDays: expirationDays || null,
            expirationStart: expirationStartFormatted,
            claimedPlaceholder: !!placeholderLicense,
          },
          responseBody: {
            license: {
              ...license,
              licenseKey: plaintextLicenseKey,
              licenseKeyLookup: undefined,
            },
          },
          source: AuditLogSource.BUILT_BY_BIT_INTEGRATION,
          tx,
        });

        const licenseWebhookEvents = await createWebhookEvents({
          eventType: WebhookEventType.LICENSE_CREATED,
          teamId: team.id,
          payload: createLicensePayload(license),
          source: AuditLogSource.BUILT_BY_BIT_INTEGRATION,
          tx,
        });

        webhookEventIds.push(...licenseWebhookEvents);

        return {
          kind: TxOutcome.Success,
          licenseId: license.id,
          claimed: !!placeholderLicense,
        };
      },
      TX_OPTIONS,
    );

    if (txResult.kind === TxOutcome.Duplicate) {
      logger.info(
        'handleBuiltByBitPurchase: Built-by-bit purchase skipped - already processed',
        {
          requestId,
          teamId: team.id,
          purchaseId,
          bbbResourceId: bbbResource.id,
          bbbUserId: bbbUser.id,
        },
      );
      return { success: true, message: 'Purchase already processed' };
    }

    if (txResult.kind === TxOutcome.LimitLicenses) {
      logger.error(
        'handleBuiltByBitPurchase: Built-by-bit purchase failed - license limit reached',
        {
          requestId,
          teamId: team.id,
          currentLicenses: team._count.licenses,
          maxLicenses: team.limits?.maxLicenses,
        },
      );
      return {
        success: false,
        message: 'Team has reached the maximum number of licenses',
      };
    }

    if (txResult.kind === TxOutcome.LimitCustomers) {
      logger.error(
        'handleBuiltByBitPurchase: Built-by-bit purchase failed - customer limit reached',
        {
          requestId,
          teamId: team.id,
          currentCustomers: team._count.customers,
          maxCustomers: team.limits?.maxCustomers,
        },
      );
      return {
        success: false,
        message: 'Team has reached the maximum number of customers',
      };
    }

    if (txResult.kind === TxOutcome.GenerationFailed) {
      logger.error(
        'handleBuiltByBitPurchase: Built-by-bit purchase failed - license key generation failed',
        {
          requestId,
          teamId: team.id,
        },
      );
      return { success: false, message: 'Failed to create a license' };
    }

    after(async () => {
      await attemptWebhookDelivery(webhookEventIds);
    });

    const handlerTime = Date.now() - handlerStartTime;

    logger.info(
      'handleBuiltByBitPurchase: Built-by-bit purchase processed successfully',
      {
        requestId,
        teamId: team.id,
        licenseId: txResult.licenseId,
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
        claimedPlaceholder: txResult.claimed,
        handlerTimeMs: handlerTime,
      },
    );

    return {
      success: true,
      message: txResult.claimed
        ? 'Placeholder license claimed successfully'
        : 'Purchase processed successfully',
    };
  } catch (error) {
    const handlerTime = Date.now() - handlerStartTime;

    logger.error(
      'handleBuiltByBitPurchase: Built-by-bit purchase processing failed',
      {
        requestId,
        teamId: team.id,
        productId: lukittuData.productId,
        bbbUserId: builtByBitData.user.id,
        bbbResourceId: builtByBitData.resource.id,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        handlerTimeMs: handlerTime,
      },
    );
    throw error;
  }
};

export const handleBuiltByBitPlaceholder = async (
  requestId: string,
  validatedData: PlaceholderBuiltByBitSchema,
  team: ExtendedTeam,
) => {
  const teamId = team.id;
  try {
    logger.info(
      'handleBuiltByBitPlaceholder: Built-by-bit placeholder request started',
      {
        requestId,
        teamId,
        steamId: validatedData.steam_id,
        userId: validatedData.user_id,
        resourceId: validatedData.resource_id,
        versionId: validatedData.version_id,
      },
    );

    type PlaceholderTxResult =
      | { kind: TxOutcome.LimitLicenses }
      | { kind: TxOutcome.GenerationFailed }
      | {
          kind: TxOutcome.Ready;
          licenseId: string;
          encryptedLicenseKey: string;
          created: boolean;
        };

    const txResult = await prisma.$transaction(
      async (tx): Promise<PlaceholderTxResult> => {
        await acquireBuiltByBitLock(tx, teamId, validatedData.user_id);

        const existing = await tx.license.findFirst({
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

        if (existing) {
          return {
            kind: TxOutcome.Ready,
            licenseId: existing.id,
            encryptedLicenseKey: existing.licenseKey,
            created: false,
          };
        }

        if (team._count.licenses >= (team.limits?.maxLicenses ?? 0)) {
          return { kind: TxOutcome.LimitLicenses };
        }

        const licenseKey = await generateUniqueLicense(teamId);
        if (!licenseKey) {
          return { kind: TxOutcome.GenerationFailed };
        }

        const hmac = generateHMAC(`${licenseKey}:${teamId}`);
        const encryptedLicenseKey = encryptString(licenseKey);

        // Suspended placeholder license: no product, no customer, no expiration.
        // Marked with BBB_PLACEHOLDER=true so the purchase webhook can find and
        // claim it. Validation calls against this key will reject (suspended).
        const created = await tx.license.create({
          data: {
            licenseKey: encryptedLicenseKey,
            licenseKeyLookup: hmac,
            teamId,
            suspended: true,
            expirationType: 'NEVER',
            expirationStart: 'CREATION',
            metadata: {
              createMany: {
                data: [
                  {
                    key: BuiltByBitMetadataKeys.BBB_USER_ID,
                    value: validatedData.user_id,
                    locked: true,
                    teamId,
                  },
                  {
                    key: BuiltByBitMetadataKeys.BBB_RESOURCE_ID,
                    value: validatedData.resource_id,
                    locked: true,
                    teamId,
                  },
                  {
                    key: BuiltByBitMetadataKeys.BBB_PLACEHOLDER,
                    value: 'true',
                    locked: true,
                    teamId,
                  },
                ],
              },
            },
          },
        });

        await createAuditLog({
          teamId,
          action: AuditLogAction.CREATE_LICENSE,
          targetId: created.id,
          targetType: AuditLogTargetType.LICENSE,
          requestBody: {
            ...validatedData,
            placeholder: true,
          },
          responseBody: {
            licenseId: created.id,
            suspended: true,
            placeholder: true,
          },
          source: AuditLogSource.BUILT_BY_BIT_INTEGRATION,
          tx,
        });

        return {
          kind: TxOutcome.Ready,
          licenseId: created.id,
          encryptedLicenseKey,
          created: true,
        };
      },
      TX_OPTIONS,
    );

    if (txResult.kind === TxOutcome.LimitLicenses) {
      logger.error(
        'handleBuiltByBitPlaceholder: Cannot create placeholder - license limit reached',
        {
          requestId,
          teamId,
          currentLicenses: team._count.licenses,
          maxLicenses: team.limits?.maxLicenses,
        },
      );

      // 404 (not OK) so BBB's downloader doesn't treat the JSON error body as
      // the license key. Same behaviour as the legacy "license not found" path.
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'Team has reached the maximum number of licenses',
      };
    }

    if (txResult.kind === TxOutcome.GenerationFailed) {
      logger.error(
        'handleBuiltByBitPlaceholder: Failed to generate placeholder license key',
        { requestId, teamId },
      );
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to create a license',
      };
    }

    const decryptedKey = decryptString(txResult.encryptedLicenseKey);

    await createAuditLog({
      teamId,
      action: AuditLogAction.SET_BUILT_BY_BIT_PLACEHOLDER,
      targetId: txResult.licenseId,
      targetType: AuditLogTargetType.LICENSE,
      requestBody: validatedData,
      responseBody: {
        licenseKey: decryptedKey,
        placeholderCreated: txResult.created,
      },
      source: AuditLogSource.BUILT_BY_BIT_INTEGRATION,
    });

    logger.info(
      'handleBuiltByBitPlaceholder: Built-by-bit placeholder completed',
      {
        requestId,
        teamId,
        userId: validatedData.user_id,
        resourceId: validatedData.resource_id,
        licenseId: txResult.licenseId,
        placeholderCreated: txResult.created,
      },
    );

    return {
      success: true,
      licenseKey: decryptedKey,
    };
  } catch (error) {
    logger.error(
      'handleBuiltByBitPlaceholder: Built-by-bit placeholder processing failed',
      {
        requestId,
        teamId,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      },
    );
    throw error;
  }
};
