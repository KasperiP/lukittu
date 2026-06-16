import { HttpStatus } from '@/types/http-status';
import {
  createEncryptionStream,
  generateHMAC,
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
import { isRateLimited, isTrustedSource } from '../security/rate-limiter';
import { downloadReleaseSchema } from '../validation/products/download-release-schema';
import { sharedVerificationHandler } from './shared/shared-verification';

interface HandleClassloaderProps {
  requestId: string;
  teamId: string;
  ipAddress: string | null;
  geoData: CloudflareVisitorData | null;
  payload: {
    licenseKey: string | undefined;
    customerId: string | undefined;
    productId: string | undefined;
    version: string | undefined;
    branch: string | undefined;
    sessionKey: string | undefined;
    hardwareIdentifier: string | undefined;
  };
}

export const handleClassloader = async ({
  requestId,
  payload,
  teamId,
  ipAddress,
  geoData,
}: HandleClassloaderProps) => {
  const handlerStartTime = Date.now();

  if (!teamId || !regex.uuidV4.test(teamId)) {
    logger.warn('handleClassloader: Invalid team UUID provided', {
      requestId,
      teamId,
    });
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
    logger.warn('handleClassloader: Schema validation failed', {
      requestId,
      teamId,
      error: validated.error.errors[0].message,
      errors: validated.error.errors.slice(0, 3),
    });
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
    hardwareIdentifier,
    customerId,
    productId,
    version,
    sessionKey,
    branch,
  } = validated.data;

  const validatedQuery = {
    query: validated.data,
  };

  const isTrusted = isTrustedSource(licenseKey, teamId);

  if (ipAddress && !isTrusted) {
    const key = `license-encrypted:${ipAddress}`;
    const isLimited = await isRateLimited(key, 30, 60); // 30 requests per 1 minute

    if (isLimited) {
      logger.warn('handleClassloader: Rate limit exceeded (IP)', {
        requestId,
        teamId,
        ipAddress,
        rateLimitKey: key,
      });
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

  if (!isTrusted) {
    // Rate limit license key requests
    const licenseKeyRatelimitKey = `license-key:${teamId}:${licenseKey}`;

    const isLicenseKeyLimited = await isRateLimited(
      licenseKeyRatelimitKey,
      30,
      60,
    ); // 30 requests per 1 minute

    if (isLicenseKeyLimited) {
      logger.warn('handleClassloader: Rate limit exceeded (license key)', {
        requestId,
        teamId,
        licenseKey: payload.licenseKey,
        rateLimitKey: licenseKeyRatelimitKey,
      });
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
      blacklist: true,
      limits: true,
    },
  });

  const settings = team?.settings;
  const limits = team?.limits;
  const keyPair = team?.keyPair;

  if (!team || !settings || !limits || !keyPair) {
    logger.warn(
      'handleClassloader: Team, settings, limits, or keyPair not found',
      {
        requestId,
        teamId,
        hasTeam: !!team,
        hasSettings: !!settings,
        hasLimits: !!limits,
        hasKeyPair: !!keyPair,
      },
    );
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
    logger.warn('handleClassloader: Classloader not allowed for team plan', {
      requestId,
      teamId,
      allowClassloader: limits.allowClassloader,
    });
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
        { requestId, teamId, error },
      );
      return null;
    }
  };

  const validatedSessionKey = await getSessionKey();

  if (!validatedSessionKey) {
    logger.warn('handleClassloader: Session key validation failed', {
      requestId,
      teamId,
      hasSessionKey: !!payload.sessionKey,
    });
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
    logger.warn('handleClassloader: Session key rate limit exceeded', {
      requestId,
      teamId,
      sessionKeyHash: validatedSessionKeyHash,
      rateLimitKey: sessionKeyRatelimitKey,
    });
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

  const ipTimeoutMinutes = settings.ipTimeout;
  const hwidTimeoutMinutes = settings.hwidTimeout;

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
      hardwareIdentifiers: {
        where: {
          forgotten: false,
          lastSeenAt: hwidTimeoutMinutes
            ? {
                gte: new Date(Date.now() - hwidTimeoutMinutes * 60 * 1000),
              }
            : undefined,
        },
      },
      ipAddresses: {
        where: {
          forgotten: false,
          lastSeenAt: ipTimeoutMinutes
            ? {
                gte: new Date(Date.now() - ipTimeoutMinutes * 60 * 1000),
              }
            : undefined,
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
    hardwareIdentifier,
    licenseKeyLookup: undefined as string | undefined,
    releaseId: undefined as string | undefined,
    releaseFileId: undefined as string | undefined,
  };

  if (!license) {
    logger.warn('handleClassloader: License not found', {
      requestId,
      teamId,
      licenseKey: payload.licenseKey,
    });
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
    logger.warn('handleClassloader: Product not found', {
      requestId,
      teamId,
      licenseId: license.id,
      requestedProductId: payload.productId,
    });
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

  let filteredReleases = matchingProduct.releases;
  if (branch) {
    const branchEntity = await prisma.releaseBranch.findUnique({
      where: {
        productId_name: {
          name: branch,
          productId,
        },
        product: {
          teamId,
        },
      },
    });

    if (!branchEntity) {
      logger.warn('handleClassloader: Branch not found', {
        requestId,
        teamId,
        licenseId: license.id,
        requestedBranch: branch,
        productId,
      });
      return {
        ...commonBase,
        status: RequestStatus.RELEASE_NOT_FOUND,
        response: {
          data: null,
          result: {
            timestamp: new Date(),
            valid: false,
            details: 'Branch not found',
          },
        },
        httpStatus: HttpStatus.NOT_FOUND,
      };
    }

    filteredReleases = filteredReleases.filter(
      (release) => release.branchId === branchEntity.id,
    );

    if (filteredReleases.length === 0) {
      logger.warn('handleClassloader: No releases found for branch', {
        requestId,
        teamId,
        licenseId: license.id,
        requestedBranch: branch,
        productId,
      });
      return {
        ...commonBase,
        status: RequestStatus.RELEASE_NOT_FOUND,
        response: {
          data: null,
          result: {
            timestamp: new Date(),
            valid: false,
            details: 'No releases found for this branch',
          },
        },
        httpStatus: HttpStatus.NOT_FOUND,
      };
    }
  }

  const versionMatchRelease = filteredReleases.find(
    (v) => v.version === version,
  );

  if (version) {
    if (!versionMatchRelease) {
      logger.warn('handleClassloader: Specific version not found', {
        requestId,
        teamId,
        licenseId: license.id,
        requestedVersion: version,
        productId,
        availableVersions: filteredReleases.map((r) => r.version),
      });
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

  const latestRelease = filteredReleases.find((release) => release.latest);

  if (!latestRelease && !versionMatchRelease) {
    logger.warn('handleClassloader: No releases available', {
      requestId,
      teamId,
      licenseId: license.id,
      productId,
      requestedVersion: version,
    });
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
    logger.warn('handleClassloader: File or release missing', {
      requestId,
      teamId,
      licenseId: license.id,
      productId,
      hasFile: !!fileToUse,
      hasRelease: !!releaseToUse,
    });
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
    logger.warn('handleClassloader: Release is archived', {
      requestId,
      teamId,
      licenseId: license.id,
      releaseId: releaseToUse.id,
      version: releaseToUse.version,
    });
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
    logger.warn('handleClassloader: Release is draft', {
      requestId,
      teamId,
      licenseId: license.id,
      releaseId: releaseToUse.id,
      version: releaseToUse.version,
    });
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
      logger.warn('handleClassloader: License not allowed for release', {
        requestId,
        teamId,
        licenseId: license.id,
        releaseId: releaseToUse.id,
        allowedLicenseCount: allowedLicenses.length,
      });
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
    hardwareIdentifier,
  );

  if (blacklistCheck) {
    logger.warn('handleClassloader: Blacklist check failed', {
      requestId,
      teamId,
      licenseKey: payload.licenseKey,
      blacklistReason: blacklistCheck.details,
      status: blacklistCheck.status,
    });
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
    logger.warn('handleClassloader: Customer validation failed', {
      requestId,
      teamId,
      licenseId: license.id,
      requestedCustomerId: customerId,
      strictMode: strictModeNoCustomerId,
      noMatch: noCustomerMatch,
    });
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
    logger.warn('handleClassloader: License is suspended', {
      requestId,
      teamId,
      licenseId: license.id,
      licenseKey: payload.licenseKey,
    });
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

  if (!licenseExpirationCheck.success) {
    logger.warn('handleClassloader: License expired', {
      requestId,
      teamId,
      licenseId: license.id,
      expiredAt: licenseExpirationCheck.expiredAt,
      licenseKey: payload.licenseKey,
    });
    return {
      ...commonBase,
      status: RequestStatus.LICENSE_EXPIRED,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'License expired',
        },
      },
      httpStatus: HttpStatus.FORBIDDEN,
    };
  }

  if (licenseExpirationCheck.expirationDate) {
    license.expirationDate = licenseExpirationCheck.expirationDate;
  }

  if (license.ipLimit && ipAddress) {
    const existingIps = license.ipAddresses.map((ip) => ip.ip);
    const ipLimitReached = existingIps.length >= license.ipLimit;

    if (!existingIps.includes(ipAddress) && ipLimitReached) {
      logger.warn('handleClassloader: IP limit reached', {
        requestId,
        teamId,
        licenseId: license.id,
        currentIpCount: existingIps.length,
        ipLimit: license.ipLimit,
        newIp: ipAddress,
      });
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

  if (license.hwidLimit && hardwareIdentifier) {
    const existingHwids = license.hardwareIdentifiers.map((hwid) => hwid.hwid);
    const hwidLimitReached = existingHwids.length >= license.hwidLimit;

    if (!existingHwids.includes(hardwareIdentifier) && hwidLimitReached) {
      logger.warn('handleClassloader: HWID limit reached', {
        requestId,
        teamId,
        licenseId: license.id,
        currentHwidCount: existingHwids.length,
        hwidLimit: license.hwidLimit,
        newHwid: hardwareIdentifier,
      });
      return {
        ...commonBase,
        status: RequestStatus.HWID_LIMIT_REACHED,
        response: {
          data: null,
          result: {
            timestamp: new Date(),
            valid: false,
            details: 'HWID limit reached',
          },
        },
        httpStatus: HttpStatus.FORBIDDEN,
      };
    }
  }

  // The last-seen writes and the S3 read are independent, so run them
  // concurrently to overlap the DB and S3 round-trips. If the transaction
  // rejects, Promise.all rejects and the handler still throws (→ 500), exactly
  // as before.
  const [, file] = await Promise.all([
    prisma.$transaction([
      prisma.hardwareIdentifier.upsert({
        where: {
          teamId,
          licenseId_hwid: {
            licenseId: license.id,
            hwid: hardwareIdentifier,
          },
        },
        create: {
          hwid: hardwareIdentifier,
          teamId,
          licenseId: license.id,
        },
        update: {
          lastSeenAt: new Date(),
          forgotten: false,
          forgottenAt: null,
        },
      }),
      ...(ipAddress
        ? [
            prisma.ipAddress.upsert({
              where: {
                teamId,
                licenseId_ip: {
                  licenseId: license.id,
                  ip: ipAddress,
                },
              },
              create: {
                ip: ipAddress,
                teamId,
                licenseId: license.id,
              },
              update: {
                lastSeenAt: new Date(),
                forgotten: false,
                forgottenAt: null,
              },
            }),
          ]
        : []),
      prisma.release.update({
        where: { id: releaseToUse.id },
        data: {
          lastSeenAt: new Date(),
        },
      }),
    ]),
    getFileFromPrivateS3(
      process.env.PRIVATE_OBJECT_STORAGE_BUCKET_NAME!,
      fileToUse.key,
    ),
  ]);

  if (!file) {
    logger.error('handleClassloader: File not found in S3', {
      requestId,
      teamId,
      releaseId: releaseToUse.id,
      fileId: fileToUse.id,
      s3Key: fileToUse.key,
    });
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

  logger.info('handleClassloader: File download initiated', {
    requestId,
    teamId,
    licenseId: license.id,
    productId: matchingProduct.id,
    releaseId: releaseToUse.id,
    fileId: fileToUse.id,
    version: releaseToUse.version,
    fileSize: fileToUse.size,
  });

  const fileStream = file.Body?.transformToWebStream();

  if (!fileStream) {
    logger.error('handleClassloader: Failed to get file stream', {
      requestId,
      teamId,
      releaseId: releaseToUse.id,
      fileId: fileToUse.id,
    });
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

  const encryptedStream = fileStream.pipeThrough(
    createEncryptionStream(validatedSessionKey),
  );

  const handlerTime = Date.now() - handlerStartTime;

  logger.info('handleClassloader: Classloader download successful', {
    requestId,
    teamId,
    licenseId: license.id,
    productId: matchingProduct.id,
    releaseId: releaseToUse.id,
    fileId: fileToUse.id,
    version: releaseToUse.version,
    handlerTimeMs: handlerTime,
    fileSize: fileToUse.size,
  });

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
    loggingData: {
      licenseKeyLookup,
      releaseId: releaseToUse.id,
      releaseFileId: fileToUse.id,
    },
  };
};
