import { HttpStatus } from '@/types/http-status';
import {
  createEncryptionStream,
  generateHMAC,
  IpLimitPeriod,
  logger,
  prisma,
  privateDecrypt,
  regex,
  ReleaseStatus,
  RequestStatus,
} from '@lukittu/shared';
import 'server-only';
import { getFileFromPrivateS3 } from '../providers/aws-s3';
import { CloudflareVisitorData } from '../providers/cloudflare';
import { isRateLimited } from '../security/rate-limiter';
import { downloadReleaseSchema } from '../validation/products/download-release-schema';
import { sharedVerificationHandler } from './shared/shared-verification';

interface HandleClassloaderProps {
  teamId: string;
  ipAddress: string | null;
  geoData: CloudflareVisitorData | null;
  payload: {
    licenseKey: string | undefined;
    customerId: string | undefined;
    productId: string | undefined;
    version: string | undefined;
    sessionKey: string | undefined;
    deviceIdentifier: string | undefined;
  };
}

export const handleClassloader = async ({
  payload,
  teamId,
  ipAddress,
  geoData,
}: HandleClassloaderProps) => {
  if (!teamId || !regex.uuidV4.test(teamId)) {
    return {
      status: RequestStatus.BAD_REQUEST,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'Invalid team UUID',
        },
      },
      httpStatus: HttpStatus.BAD_REQUEST,
    };
  }

  const validated = await downloadReleaseSchema().safeParseAsync(payload);

  if (!validated.success) {
    return {
      status: RequestStatus.BAD_REQUEST,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: validated.error.errors[0].message,
        },
      },
      httpStatus: HttpStatus.BAD_REQUEST,
    };
  }

  const {
    licenseKey,
    deviceIdentifier,
    customerId,
    productId,
    version,
    sessionKey,
  } = validated.data;

  const validatedQuery = {
    query: validated.data,
  };

  if (ipAddress) {
    const key = `license-encrypted:${ipAddress}`;
    const isLimited = await isRateLimited(key, 5, 60); // 5 requests per 1 minute

    if (isLimited) {
      return {
        ...validatedQuery,
        status: RequestStatus.RATE_LIMIT,
        response: {
          data: null,
          result: {
            timestamp: new Date(),
            valid: false,
            details: 'Rate limited',
          },
        },
        httpStatus: HttpStatus.TOO_MANY_REQUESTS,
      };
    }
  }

  if (licenseKey) {
    // Rate limit license key requests
    const licenseKeyRatelimitKey = `license-key:${teamId}:${licenseKey}`;

    const isLicenseKeyLimited = await isRateLimited(
      licenseKeyRatelimitKey,
      5,
      60,
    ); // 5 requests per 1 minute

    if (isLicenseKeyLimited) {
      return {
        ...validatedQuery,
        status: RequestStatus.RATE_LIMIT,
        response: {
          data: null,
          result: {
            timestamp: new Date(),
            valid: false,
            details: 'Rate limited',
          },
        },
        httpStatus: HttpStatus.TOO_MANY_REQUESTS,
      };
    }
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId, deletedAt: null },
    include: {
      keyPair: {
        omit: {
          privateKey: false,
        },
      },
      settings: true,
      watermarkingSettings: true,
      blacklist: true,
      limits: true,
    },
  });

  const settings = team?.settings;
  const watermarkingSettings = team?.watermarkingSettings;
  const limits = team?.limits;
  const keyPair = team?.keyPair;

  if (!team || !settings || !limits || !keyPair) {
    return {
      ...validatedQuery,
      status: RequestStatus.TEAM_NOT_FOUND,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'Team not found',
        },
      },
      httpStatus: HttpStatus.NOT_FOUND,
    };
  }

  if (!limits.allowClassloader) {
    return {
      ...validatedQuery,
      teamId,
      status: RequestStatus.FORBIDDEN,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details:
            'Using classloader requires a higher plan. Either upgrade or contact support.',
        },
      },
      httpStatus: HttpStatus.FORBIDDEN,
    };
  }

  const privateKey = keyPair.privateKey;

  const getSessionKey = async () => {
    try {
      const decryptedBuffer = await privateDecrypt(sessionKey, privateKey);
      return Buffer.from(decryptedBuffer).toString('hex');
    } catch (error) {
      logger.error(
        'Error occurred while decrypting session key in download route',
        error,
      );
      return null;
    }
  };

  const validatedSessionKey = await getSessionKey();

  if (!validatedSessionKey) {
    return {
      ...validatedQuery,
      teamId,
      status: RequestStatus.INVALID_SESSION_KEY,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'Invalid session key',
        },
      },
      httpStatus: HttpStatus.BAD_REQUEST,
    };
  }

  const validatedSessionKeyHash = generateHMAC(validatedSessionKey);
  const sessionKeyRatelimitKey = `session-key:${teamId}:${validatedSessionKeyHash}`;

  const isSessionKeyLimited = await isRateLimited(
    sessionKeyRatelimitKey,
    1,
    900,
  ); // 1 request per 15 minutes

  if (isSessionKeyLimited) {
    return {
      ...validatedQuery,
      teamId,
      status: RequestStatus.RATE_LIMIT,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'Rate limited',
        },
      },
      httpStatus: HttpStatus.TOO_MANY_REQUESTS,
    };
  }

  const licenseKeyLookup = generateHMAC(`${licenseKey}:${teamId}`);

  const ipLimitPeriodDays =
    settings.ipLimitPeriod === IpLimitPeriod.DAY
      ? 1
      : settings.ipLimitPeriod === IpLimitPeriod.WEEK
        ? 7
        : 30;

  const ipLimitPeriodDate = new Date(
    new Date().getTime() - ipLimitPeriodDays * 24 * 60 * 60 * 1000,
  );

  const license = await prisma.license.findUnique({
    where: {
      team: {
        deletedAt: null,
      },
      teamId_licenseKeyLookup: { teamId, licenseKeyLookup },
    },
    include: {
      customers: true,
      products: {
        where: {
          id: productId,
        },
        include: {
          releases: {
            where: {
              file: {
                isNot: null,
              },
            },
            include: {
              file: true,
              allowedLicenses: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      },
      devices: true,
      requestLogs: {
        where: {
          createdAt: {
            gte: ipLimitPeriodDate,
          },
        },
      },
    },
  });

  const licenseHasCustomers = Boolean(license?.customers.length);

  const hasStrictCustomers = settings.strictCustomers || false;

  const matchingCustomer = license?.customers.find(
    (customer) => customer.id === customerId,
  );

  const matchingProduct = license?.products.find(
    (product) => product.id === productId,
  );

  const commonBase = {
    ...validatedQuery,
    teamId,
    customerId: matchingCustomer ? customerId : undefined,
    productId: matchingProduct ? productId : undefined,
    deviceIdentifier,
    licenseKeyLookup: undefined as string | undefined,
    releaseId: undefined as string | undefined,
    releaseFileId: undefined as string | undefined,
  };

  if (!license) {
    return {
      ...commonBase,
      status: RequestStatus.LICENSE_NOT_FOUND,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'License not found',
        },
      },
      httpStatus: HttpStatus.NOT_FOUND,
    };
  }

  commonBase.licenseKeyLookup = licenseKeyLookup;

  if (!matchingProduct) {
    return {
      ...commonBase,
      status: RequestStatus.PRODUCT_NOT_FOUND,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'Product not found',
        },
      },
      httpStatus: HttpStatus.NOT_FOUND,
    };
  }

  const versionMatchRelease = matchingProduct.releases.find(
    (v) => v.version === version,
  );
  if (version) {
    if (!versionMatchRelease) {
      return {
        ...commonBase,
        status: RequestStatus.RELEASE_NOT_FOUND,
        response: {
          data: null,
          result: {
            timestamp: new Date(),
            valid: false,
            details: 'Release not found',
          },
        },
        httpStatus: HttpStatus.NOT_FOUND,
      };
    }
  }

  const latestRelease = matchingProduct.releases.find(
    (release) => release.latest,
  );

  if (!latestRelease && !versionMatchRelease) {
    return {
      ...commonBase,
      status: RequestStatus.RELEASE_NOT_FOUND,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'Release not found',
        },
      },
      httpStatus: HttpStatus.NOT_FOUND,
    };
  }

  const releaseToUse = version ? versionMatchRelease : latestRelease;
  const fileToUse = version ? versionMatchRelease?.file : latestRelease?.file;

  if (!fileToUse || !releaseToUse) {
    return {
      ...commonBase,
      status: RequestStatus.RELEASE_NOT_FOUND,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'File or release not found',
        },
      },
      httpStatus: HttpStatus.NOT_FOUND,
    };
  }

  commonBase.releaseId = releaseToUse.id;
  commonBase.releaseFileId = fileToUse.id;

  if (releaseToUse.status === ReleaseStatus.ARCHIVED) {
    return {
      ...commonBase,
      status: RequestStatus.RELEASE_ARCHIVED,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'Release is archived',
        },
      },
      httpStatus: HttpStatus.FORBIDDEN,
    };
  }

  if (releaseToUse.status === ReleaseStatus.DRAFT) {
    return {
      ...commonBase,
      status: RequestStatus.RELEASE_DRAFT,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'Release is draft',
        },
      },
      httpStatus: HttpStatus.FORBIDDEN,
    };
  }

  if (releaseToUse.allowedLicenses.length) {
    const allowedLicenses = releaseToUse.allowedLicenses.map((al) => al.id);

    if (!allowedLicenses.includes(license.id)) {
      return {
        ...commonBase,
        status: RequestStatus.NO_ACCESS_TO_RELEASE,
        response: {
          data: null,
          result: {
            timestamp: new Date(),
            valid: false,
            details: 'License does not have access to this release',
          },
        },
        httpStatus: HttpStatus.FORBIDDEN,
      };
    }
  }

  const blacklistCheck = await sharedVerificationHandler.checkBlacklist(
    team,
    teamId,
    ipAddress,
    geoData,
    deviceIdentifier,
  );

  if (blacklistCheck) {
    return {
      ...commonBase,
      status: blacklistCheck.status,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: blacklistCheck.details,
        },
      },
      httpStatus: HttpStatus.FORBIDDEN,
    };
  }

  const strictModeNoCustomerId =
    hasStrictCustomers && licenseHasCustomers && !customerId;
  const noCustomerMatch =
    licenseHasCustomers && customerId && !matchingCustomer;

  if (strictModeNoCustomerId || noCustomerMatch) {
    return {
      ...commonBase,
      status: RequestStatus.CUSTOMER_NOT_FOUND,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'Customer not found',
        },
      },
      httpStatus: HttpStatus.NOT_FOUND,
    };
  }

  if (license.suspended) {
    return {
      ...commonBase,
      status: RequestStatus.LICENSE_SUSPENDED,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'License suspended',
        },
      },
      httpStatus: HttpStatus.FORBIDDEN,
    };
  }

  const licenseExpirationCheck =
    await sharedVerificationHandler.checkLicenseExpiration(
      license,
      licenseKeyLookup,
    );

  if (licenseExpirationCheck) {
    return {
      ...commonBase,
      status: licenseExpirationCheck.status,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: licenseExpirationCheck.details,
        },
      },
      httpStatus: HttpStatus.FORBIDDEN,
    };
  }

  if (license.ipLimit) {
    const existingIps = Array.from(
      new Set(license.requestLogs.map((log) => log.ipAddress).filter(Boolean)),
    );
    const ipLimitReached = existingIps.length >= license.ipLimit;

    // TODO: @KasperiP: Maybe add separate table for storing IP addresses because user's probably want to also remove old IP addresses
    if (!existingIps.includes(ipAddress) && ipLimitReached) {
      return {
        ...commonBase,
        status: RequestStatus.IP_LIMIT_REACHED,
        response: {
          data: null,
          result: {
            timestamp: new Date(),
            valid: false,
            details: 'IP limit reached',
          },
        },
        httpStatus: HttpStatus.FORBIDDEN,
      };
    }
  }

  const seatCheck = await sharedVerificationHandler.checkSeats(
    license,
    deviceIdentifier,
    settings.deviceTimeout || 60,
  );

  if (seatCheck) {
    return {
      ...commonBase,
      status: seatCheck.status,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: seatCheck.details,
        },
      },
      httpStatus: HttpStatus.FORBIDDEN,
    };
  }

  await prisma.$transaction([
    prisma.device.upsert({
      where: {
        licenseId_deviceIdentifier: {
          licenseId: license.id,
          deviceIdentifier,
        },
      },
      update: {
        lastBeatAt: new Date(),
        ipAddress,
        country: geoData?.alpha3 || null,
      },
      create: {
        ipAddress,
        teamId: team.id,
        deviceIdentifier,
        lastBeatAt: new Date(),
        licenseId: license.id,
        country: geoData?.alpha3 || null,
      },
    }),
    prisma.release.update({
      where: { id: releaseToUse.id },
      data: {
        lastSeenAt: new Date(),
      },
    }),
  ]);

  const file = await getFileFromPrivateS3(
    process.env.PRIVATE_OBJECT_STORAGE_BUCKET_NAME!,
    fileToUse.key,
  );

  if (!file) {
    return {
      ...commonBase,
      status: RequestStatus.RELEASE_NOT_FOUND,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'File not found',
        },
      },
      httpStatus: HttpStatus.NOT_FOUND,
    };
  }

  const isJar = Boolean(releaseToUse.file?.mainClassName);

  const hasAtLeastOneWatermarkingMethodEnabled = Boolean(
    watermarkingSettings?.staticConstantPoolSynthesis ||
      watermarkingSettings?.dynamicBytecodeInjection ||
      watermarkingSettings?.temporalAttributeEmbedding,
  );

  const watermarkingEnabled = Boolean(
    watermarkingSettings?.watermarkingEnabled &&
      hasAtLeastOneWatermarkingMethodEnabled &&
      limits.allowWatermarking &&
      isJar,
  );

  logger.info(
    `Downloading file for team ${teamId}, release ${releaseToUse.id}, file ${fileToUse.id}`,
    {
      'settings.watermarking': watermarkingSettings,
      'limits.allowWatermarking': limits.allowWatermarking,
      isJar,
    },
  );

  const fileStream = watermarkingEnabled
    ? await file.Body?.transformToByteArray()
    : file.Body?.transformToWebStream();

  if (!fileStream) {
    return {
      ...commonBase,
      status: RequestStatus.INTERNAL_SERVER_ERROR,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'Internal server error',
        },
      },
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }

  let fileStreamFormatted: ReadableStream<any> | null = null;

  if (watermarkingEnabled) {
    logger.info('Watermarking enabled');
    const embedFormData = new FormData();
    embedFormData.append(
      'file',
      new Blob([fileStream as Uint8Array<ArrayBufferLike>], {
        type: 'application/java-archive',
      }),
      'file.jar',
    );

    const WATERMARK = `${teamId}:${licenseKeyLookup}`;
    const ENCRYPTION_KEY = generateHMAC(teamId).slice(0, 16);

    const methods: (
      | 'STATIC_CONSTANT_POOL_SYNTHESIS'
      | 'DYNAMIC_BYTECODE_INJECTION'
      | 'TEMPORAL_ATTRIBUTE_EMBEDDING'
    )[] = [];

    const densities: number[] = [];

    if (watermarkingSettings?.staticConstantPoolSynthesis) {
      methods.push('STATIC_CONSTANT_POOL_SYNTHESIS');
      densities.push(
        watermarkingSettings.staticConstantPoolDensity
          ? Number(
              (watermarkingSettings.staticConstantPoolDensity / 100).toFixed(2),
            )
          : 0,
      );
    }

    if (watermarkingSettings?.dynamicBytecodeInjection) {
      methods.push('DYNAMIC_BYTECODE_INJECTION');
      densities.push(
        watermarkingSettings.dynamicBytecodeDensity
          ? Number(
              (watermarkingSettings.dynamicBytecodeDensity / 100).toFixed(2),
            )
          : 0,
      );
    }

    if (watermarkingSettings?.temporalAttributeEmbedding) {
      methods.push('TEMPORAL_ATTRIBUTE_EMBEDDING');
      densities.push(
        watermarkingSettings.temporalAttributeDensity
          ? Number(
              (watermarkingSettings.temporalAttributeDensity / 100).toFixed(2),
            )
          : 0,
      );
    }

    const embedResponse = await fetch(
      `${process.env.WATERMARK_SERVICE_BASE_URL}/api/watermark/embed`,
      {
        method: 'POST',
        headers: {
          'X-Watermark': WATERMARK,
          'X-Encryption-Key': ENCRYPTION_KEY,
          'X-Watermark-Methods': methods.join(','),
          'X-Watermark-Density': densities.join(','),
        },
        body: embedFormData,
      },
    );

    if (!embedResponse.ok) {
      logger.error(
        `Error occurred while watermarking file for team ${teamId}`,
        embedResponse,
      );
      return {
        ...commonBase,
        status: RequestStatus.INTERNAL_SERVER_ERROR,
        response: {
          data: null,
          result: {
            timestamp: new Date(),
            valid: false,
            details: 'Internal server error',
          },
        },
        httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }

    const watermarkedData = await embedResponse.arrayBuffer();
    logger.info(`Successfully watermarked file for team ${teamId}`);

    // Create a readable stream with proper chunking (128KB)
    const CHUNK_SIZE = 128 * 1024; // 128KB
    fileStreamFormatted = new ReadableStream({
      start(controller) {
        const data = new Uint8Array(watermarkedData);
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
          const chunk = data.slice(i, i + CHUNK_SIZE);
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
  } else {
    fileStreamFormatted = fileStream as ReadableStream<any>;
  }

  const encryptedStream = fileStreamFormatted.pipeThrough(
    createEncryptionStream(validatedSessionKey),
  );

  return {
    stream: encryptedStream,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-File-Size': fileToUse.size.toString(),
      'X-Product-Name': matchingProduct.name,
      'X-Release-Status': releaseToUse.status,
      'X-Release-Created-At': releaseToUse.createdAt.toISOString(),
      'X-File-Created-At': fileToUse.createdAt.toISOString(),
      'X-Version': releaseToUse.version,
      ...(latestRelease?.version
        ? { 'X-Latest-Version': latestRelease.version }
        : {}),
      ...(process.env.version
        ? { 'X-Lukittu-Version': process.env.version }
        : {}),
      ...(fileToUse.mainClassName
        ? {
            'X-Main-Class': fileToUse.mainClassName,
          }
        : {}),
    },
  };
};
