import { HttpStatus } from '@/types/http-status';
import {
  BuiltByBitIntegration,
  decryptLicenseKey,
  encryptLicenseKey,
  generateHMAC,
  generateUniqueLicense,
  Limits,
  logger,
  prisma,
  Settings,
  Team,
} from '@lukittu/shared';
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
    const { productId, seats, expirationStart, expirationDays, ipLimit } =
      lukittuData;

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
            key: 'PURCHASE_ID',
            value: purchaseId,
          },
        },
      },
    });

    if (existingPurchase) {
      logger.info('Skipping: Purchase already processed', {
        purchaseId,
        teamId: team.id,
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
      logger.info('Skipping: Product not found in database', {
        productId,
      });
      return {
        success: false,
        message: 'Product not found',
      };
    }

    if (team._count.licenses >= (team.limits?.maxLicenses ?? 0)) {
      logger.info('Skipping: Team has reached the maximum number of licenses', {
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
      logger.info(
        'Skipping: Team has reached the maximum number of customers',
        {
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
        key: 'BBB_USER_ID',
        value: bbbUser.id,
        locked: true,
      },
      {
        key: 'BBB_RESOURCE_ID',
        value: bbbResource.id,
        locked: true,
      },
      {
        key: 'PURCHASE_ID',
        value: purchaseId,
        locked: true,
      },
      ...(bbbResource.addon.id && bbbResource.addon.id !== '0'
        ? [
            {
              key: 'BBB_ADDON_ID',
              value: bbbResource.addon.id,
              locked: true,
            },
          ]
        : []),
    ];

    const license = await prisma.$transaction(async (prisma) => {
      const existingLukittuCustomer = await prisma.customer.findFirst({
        where: {
          metadata: {
            some: {
              key: 'BBB_USER_ID',
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
              key: 'BBB_USER_ID',
              value: bbbUser.id,
              locked: true,
              teamId: team.id,
            },
          },
        },
        update: {
          username: bbbUser.username,
        },
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
          ipLimit,
          seats,
          expirationType: expirationDays ? 'DURATION' : 'NEVER',
          expirationDays: expirationDays || null,
          expirationStart: expirationStartFormatted,
          expirationDate,
        },
        include: {
          products: true,
        },
      });

      return license;
    });

    if (!license) {
      logger.error('Failed to create a license');
      return {
        success: false,
        message: 'Failed to create a license',
      };
    }

    logger.info('BuiltByBit purchase processed successfully', {
      licenseId: license.id,
      teamId: team.id,
      productId,
      resourceId: bbbResource.id,
      resourceTitle: bbbResource.title,
      addonId: bbbResource.addon.id,
      addonTitle: bbbResource.addon.title,
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
    logger.info('Received valid placeholder data from BuiltByBit', {
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
                key: 'BBB_USER',
                value: validatedData.user_id,
              },
            },
          },
          {
            metadata: {
              some: {
                key: 'BBB_RESOURCE',
                value: validatedData.resource_id,
              },
            },
          },
        ],
      },
    });

    if (!licenseKey) {
      logger.error('License key not found', {
        teamId,
        user_id: validatedData.user_id,
        resource_id: validatedData.resource_id,
      });
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'License key not found',
      };
    }

    const decryptedKey = decryptLicenseKey(licenseKey.licenseKey);

    return {
      success: true,
      licenseKey: decryptedKey,
    };
  } catch (error) {
    logger.error('Error handling BuiltByBit placeholder', { error, teamId });
    throw error;
  }
};
