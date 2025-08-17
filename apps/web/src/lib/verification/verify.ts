import { HttpStatus } from '@/types/http-status';
import {
  generateHMAC,
  prisma,
  regex,
  RequestStatus,
  signChallenge,
} from '@lukittu/shared';
import 'server-only';
import { CloudflareVisitorData } from '../providers/cloudflare';
import { isRateLimited, isTrustedSource } from '../security/rate-limiter';
import { verifyLicenseSchema } from '../validation/licenses/verify-license-schema';
import { getReturnedFields } from './shared/shared-returned-fields';
import { sharedVerificationHandler } from './shared/shared-verification';

interface HandleVerifyProps {
  teamId: string;
  ipAddress: string | null;
  geoData: CloudflareVisitorData | null;
  payload: {
    licenseKey: string;
    customerId?: string | undefined;
    productId?: string | undefined;
    challenge?: string | undefined;
    version?: string | undefined;
    hardwareIdentifier?: string | undefined;
  };
}

export const handleVerify = async ({
  teamId,
  ipAddress,
  geoData,
  payload,
}: HandleVerifyProps) => {
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

  const validated = await verifyLicenseSchema().safeParseAsync(payload);

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

  const validatedBody = {
    body: validated.data,
  };

  const isTrusted = isTrustedSource(payload.licenseKey, teamId);

  if (ipAddress && !isTrusted) {
    const key = `license-verify:${ipAddress}`;
    const isLimited = await isRateLimited(key, 30, 60); // 30 requests per minute

    if (isLimited) {
      return {
        ...validatedBody,
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
      blacklist: true,
      settings: {
        include: {
          returnedFields: true,
        },
      },
    },
  });

  const settings = team?.settings;
  const keyPair = team?.keyPair;

  if (!team || !settings || !keyPair) {
    return {
      ...validatedBody,
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

  const {
    licenseKey,
    customerId,
    productId,
    challenge,
    hardwareIdentifier,
    version,
    branch,
  } = validated.data;

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
      metadata: true,
      customers: {
        include: {
          metadata: true,
        },
      },
      products: {
        include: {
          metadata: true,
          releases: {
            where: {
              status: 'PUBLISHED',
            },
            include: {
              file: true,
            },
          },
        },
      },
      hardwareIdentifiers: {
        where: {
          lastSeenAt: hwidTimeoutMinutes
            ? {
                gte: new Date(Date.now() - hwidTimeoutMinutes * 60 * 1000),
              }
            : undefined,
        },
      },
      ipAddresses: {
        where: {
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
  const licenseHasProducts = Boolean(license?.products.length);

  const hasStrictProducts = settings.strictProducts || false;
  const hasStrictCustomers = settings.strictCustomers || false;
  const hasStrictReleases = settings.strictReleases || false;

  const matchingCustomer = license?.customers.find(
    (customer) => customer.id === customerId,
  );

  const matchingProduct = license?.products.find(
    (product) => product.id === productId,
  );

  const commonBase = {
    ...validatedBody,
    teamId,
    customerId: matchingCustomer ? customerId : undefined,
    productId: matchingProduct ? productId : undefined,
    hardwareIdentifier,
    licenseKeyLookup: undefined as string | undefined,
    releaseId: undefined as string | undefined,
    releaseFileId: undefined as string | undefined,
  };

  let filteredReleases = matchingProduct?.releases || [];
  if (branch && matchingProduct) {
    const branchEntity = await prisma.releaseBranch.findUnique({
      where: {
        productId_name: {
          name: branch,
          productId: matchingProduct.id,
        },
        product: {
          teamId,
        },
      },
    });

    if (!branchEntity) {
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

  const productHasReleases = filteredReleases.length > 0;

  const matchingRelease = filteredReleases.find(
    (release) => release.version === version,
  );

  const latestRelease = filteredReleases.find((r) => r.latest);

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

  const blacklistCheck = await sharedVerificationHandler.checkBlacklist(
    team,
    teamId,
    ipAddress,
    geoData,
    hardwareIdentifier,
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

  const strictModeNoProductId =
    hasStrictProducts && licenseHasProducts && !productId;
  const noProductMatch = licenseHasProducts && productId && !matchingProduct;

  if (strictModeNoProductId || noProductMatch) {
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

  const strictModeNoVersion =
    hasStrictReleases && productHasReleases && !version;
  const noVersionMatch = productHasReleases && version && !matchingRelease;

  if (strictModeNoVersion || noVersionMatch) {
    return {
      ...commonBase,
      status: RequestStatus.RELEASE_NOT_FOUND,
      response: {
        data: null,
        result: {
          timestamp: new Date(),
          valid: false,
          details: 'Release not found with specified version',
        },
      },
      httpStatus: HttpStatus.NOT_FOUND,
    };
  }

  commonBase.releaseId = matchingRelease?.id;

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

  if (license.ipLimit && ipAddress) {
    const existingIps = license.ipAddresses.map((ip) => ip.ip);
    const ipLimitReached = existingIps.length >= license.ipLimit;

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

  if (license.hwidLimit && hardwareIdentifier) {
    const existingHwids = license.hardwareIdentifiers.map((hwid) => hwid.hwid);
    const hwidLimitReached = existingHwids.length >= license.hwidLimit;

    if (!existingHwids.includes(hardwareIdentifier) && hwidLimitReached) {
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

  await prisma.$transaction([
    ...(hardwareIdentifier
      ? [
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
        ]
      : []),
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
    ...(matchingRelease || latestRelease
      ? [
          prisma.release.update({
            where: { id: (matchingRelease || latestRelease)!.id },
            data: {
              lastSeenAt: new Date(),
            },
          }),
        ]
      : []),
  ]);

  const challengeResponse = challenge
    ? signChallenge(challenge, keyPair.privateKey)
    : undefined;

  const returnedData = getReturnedFields({
    requestedBranch: branch || null,
    returnedFields: settings.returnedFields,
    license,
  });

  return {
    ...commonBase,
    status: RequestStatus.VALID,
    response: {
      data: returnedData,
      result: {
        timestamp: new Date(),
        valid: true,
        details: 'License is valid',
        challengeResponse,
      },
    },
    httpStatus: HttpStatus.OK,
  };
};
