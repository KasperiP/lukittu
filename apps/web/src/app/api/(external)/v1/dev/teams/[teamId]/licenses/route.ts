import { sendLicenseDistributionEmail } from '@/lib/emails/templates/send-license-distribution-email';
import {
  EmailDeliveryError,
  RateLimitExceededError,
} from '@/lib/errors/errors';
import { createAuditLog } from '@/lib/logging/audit-log';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { getIp } from '@/lib/utils/header-helpers';
import {
  CreateLicenseSchema,
  createLicenseSchema,
} from '@/lib/validation/licenses/set-license-schema';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  attemptWebhookDelivery,
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  createLicensePayload,
  createWebhookEvents,
  decryptLicenseKey,
  encryptLicenseKey,
  generateHMAC,
  generateUniqueLicense,
  LicenseExpirationStart,
  LicenseStatus,
  logger,
  prisma,
  Prisma,
  regex,
  WebhookEventType,
} from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const { teamId } = params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();

  try {
    logger.info('Dev API: Create license request started', {
      requestId,
      teamId,
      route: '/v1/dev/teams/[teamId]/licenses',
      method: 'POST',
      userAgent,
      timestamp: requestTime.toISOString(),
      ipAddress,
    });

    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Invalid teamId provided for license creation', {
        requestId,
        providedTeamId: teamId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid teamId',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.BAD_REQUEST,
        },
      );
    }

    const { team } = await verifyApiAuthorization(teamId);

    if (!team) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: API key authentication failed', {
        requestId,
        teamId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.UNAUTHORIZED,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid API key',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.UNAUTHORIZED,
        },
      );
    }

    const body = (await request.json()) as CreateLicenseSchema;

    const validated = await createLicenseSchema().safeParseAsync(body);

    if (!validated.success) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: License creation validation failed', {
        requestId,
        teamId,
        validationErrors: validated.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: validated.error.errors.map((error) => ({
            message: error.message,
            path: error.path,
          })),
          result: {
            details: 'Invalid request body',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.BAD_REQUEST,
        },
      );
    }

    const {
      customerIds,
      expirationDate,
      expirationDays,
      expirationStart,
      expirationType,
      ipLimit,
      metadata,
      productIds,
      hwidLimit,
      suspended,
      sendEmailDelivery,
    } = body;

    const licenseAmount = await prisma.license.count({
      where: {
        teamId,
      },
    });

    if (licenseAmount >= team.limits.maxLicenses) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: License limit exceeded', {
        requestId,
        teamId,
        currentCount: licenseAmount,
        maxAllowed: team.limits.maxLicenses,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.FORBIDDEN,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Max licenses reached',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.FORBIDDEN,
        },
      );
    }

    const productsPromise = prisma.product.findMany({
      where: {
        teamId: team.id,
        id: {
          in: productIds,
        },
      },
    });

    const customersPromise = prisma.customer.findMany({
      where: {
        teamId: team.id,
        id: {
          in: customerIds,
        },
      },
    });

    const [products, customers] = await Promise.all([
      productsPromise,
      customersPromise,
    ]);

    if (products.length !== productIds.length) {
      const responseTime = Date.now() - requestTime.getTime();
      const foundProductIds = products.map((p) => p.id);
      const missingProductIds = productIds.filter(
        (id) => !foundProductIds.includes(id),
      );

      logger.warn('Dev API: Referenced products not found', {
        requestId,
        teamId,
        requestedProductIds: productIds,
        foundProductIds,
        missingProductIds,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid productIds',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (customers.length !== customerIds.length) {
      const responseTime = Date.now() - requestTime.getTime();
      const foundCustomerIds = customers.map((c) => c.id);
      const missingCustomerIds = customerIds.filter(
        (id) => !foundCustomerIds.includes(id),
      );

      logger.warn('Dev API: Referenced customers not found', {
        requestId,
        teamId,
        requestedCustomerIds: customerIds,
        foundCustomerIds,
        missingCustomerIds,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid customerIds',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const licenseKey = await generateUniqueLicense(teamId);

    if (!licenseKey) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.error('Dev API: License key generation failed', {
        requestId,
        teamId,
        error: 'generateUniqueLicense returned null',
        responseTimeMs: responseTime,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Failed to generate license key',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        },
      );
    }

    const encryptedLicenseKey = encryptLicenseKey(licenseKey);
    const hmac = generateHMAC(`${licenseKey}:${team.id}`);
    let webhookEventIds: string[] = [];

    const expirationStartFormatted =
      expirationStart?.toUpperCase() === LicenseExpirationStart.ACTIVATION
        ? LicenseExpirationStart.ACTIVATION
        : LicenseExpirationStart.CREATION;

    const expirationDateFormatted =
      expirationStartFormatted === LicenseExpirationStart.CREATION &&
      expirationDays
        ? new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000)
        : expirationDate;

    try {
      const response = await prisma.$transaction(async (prisma) => {
        const license = await prisma.license.create({
          data: {
            expirationDays,
            expirationDate: expirationDateFormatted,
            expirationStart: expirationStartFormatted,
            expirationType,
            ipLimit,
            licenseKey: encryptedLicenseKey,
            licenseKeyLookup: hmac,
            metadata: {
              createMany: {
                data: metadata.map((m) => ({
                  ...m,
                  teamId: team.id,
                })),
              },
            },
            suspended,
            teamId: team.id,
            hwidLimit,
            products: productIds.length
              ? { connect: productIds.map((id) => ({ id })) }
              : undefined,
            customers: customerIds.length
              ? { connect: customerIds.map((id) => ({ id })) }
              : undefined,
          },
          include: {
            customers: true,
            products: true,
            metadata: true,
          },
        });

        if (sendEmailDelivery) {
          const customerEmails = license.customers
            .filter((customer) => customerIds.includes(customer.id))
            .filter((customer) => customer.email)
            .map((customer) => customer.email)
            .filter(Boolean) as string[];

          if (customerEmails.length) {
            const key = `email-delivery:${team.id}`;
            const isLimited = await isRateLimited(key, 50, 86400); // 50 requests per day
            if (isLimited) {
              logger.warn('Dev API: Email delivery rate limit exceeded', {
                requestId,
                teamId: team.id,
                rateLimitKey: key,
                dailyLimit: 50,
                responseTimeMs: Date.now() - requestTime.getTime(),
                ipAddress,
                userAgent,
              });
              throw new RateLimitExceededError();
            }

            const emailsSent = await Promise.all(
              license.customers
                .filter((customer) => customer.email)
                .map(async (customer) => {
                  const success = await sendLicenseDistributionEmail({
                    customer,
                    licenseKey,
                    license,
                    team,
                  });

                  return success;
                }),
            );

            const success = emailsSent.every((email) => email);

            if (!success) {
              logger.error(
                'Dev API: Email delivery failed during license creation',
                {
                  requestId,
                  teamId: team.id,
                  licenseId: license.id,
                  recipientCount: customerEmails.length,
                  customerEmails,
                  responseTimeMs: Date.now() - requestTime.getTime(),
                  ipAddress,
                  userAgent,
                },
              );
              throw new EmailDeliveryError();
            }
          }
        }

        const response: IExternalDevResponse = {
          data: {
            ...license,

            /** @deprecated Use hwidLimit */
            seats: license.hwidLimit,
            licenseKey,
            licenseKeyLookup: undefined,
          },
          result: {
            details: 'License created',
            timestamp: new Date(),
            valid: true,
          },
        };

        await createAuditLog({
          teamId: team.id,
          action: AuditLogAction.CREATE_LICENSE,
          targetId: license.id,
          targetType: AuditLogTargetType.LICENSE,
          requestBody: body,
          responseBody: response,
          source: AuditLogSource.API_KEY,
          tx: prisma,
        });

        webhookEventIds = await createWebhookEvents({
          eventType: WebhookEventType.LICENSE_CREATED,
          teamId: team.id,
          payload: createLicensePayload(license),
          source: AuditLogSource.API_KEY,
          tx: prisma,
        });

        return response;
      });

      void attemptWebhookDelivery(webhookEventIds);

      const responseTime = Date.now() - requestTime.getTime();

      logger.info('Dev API: License created successfully', {
        requestId,
        teamId,
        licenseId: response.data.id,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.OK,
        emailDelivery: sendEmailDelivery || false,
      });

      return NextResponse.json(response);
    } catch (txError) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.error('Dev API: License creation transaction failed', {
        requestId,
        teamId,
        route: '/v1/dev/teams/[teamId]/licenses',
        error: txError instanceof Error ? txError.message : String(txError),
        errorType: txError?.constructor?.name || 'Unknown',
        responseTimeMs: responseTime,
        ipAddress,
        userAgent,
      });

      if (txError instanceof RateLimitExceededError) {
        return NextResponse.json(
          {
            data: null,
            result: {
              details: 'Too many requests',
              timestamp: new Date(),
              valid: false,
            },
          },
          { status: HttpStatus.TOO_MANY_REQUESTS },
        );
      } else if (txError instanceof EmailDeliveryError) {
        return NextResponse.json(
          {
            data: null,
            result: {
              details: 'Failed to send email',
              timestamp: new Date(),
              valid: false,
            },
          },
          { status: HttpStatus.INTERNAL_SERVER_ERROR },
        );
      }

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Error processing license creation',
            timestamp: new Date(),
            valid: false,
          },
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Create license failed', {
      requestId,
      teamId,
      route: '/v1/dev/teams/[teamId]/licenses',
      error: error instanceof Error ? error.message : String(error),
      errorType:
        error instanceof SyntaxError
          ? 'SyntaxError'
          : error?.constructor?.name || 'Unknown',
      responseTimeMs: responseTime,
      ipAddress,
      userAgent,
    });

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid JSON body',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.BAD_REQUEST,
        },
      );
    }

    return NextResponse.json(
      {
        data: null,
        result: {
          details: 'Internal server error',
          timestamp: new Date(),
          valid: false,
        },
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      },
    );
  }
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;
  const { teamId } = params;
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const ipAddress = await getIp();

  try {
    logger.info('Dev API: Get licenses request started', {
      requestId,
      teamId,
      route: '/v1/dev/teams/[teamId]/licenses',
      method: 'GET',
      userAgent,
      timestamp: requestTime.toISOString(),
      ipAddress,
    });

    if (!teamId || !regex.uuidV4.test(teamId)) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn('Dev API: Invalid teamId provided for license listing', {
        requestId,
        providedTeamId: teamId,
        responseTimeMs: responseTime,
        statusCode: HttpStatus.BAD_REQUEST,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid teamId',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.BAD_REQUEST,
        },
      );
    }

    const { team } = await verifyApiAuthorization(teamId);

    if (!team) {
      const responseTime = Date.now() - requestTime.getTime();

      logger.warn(
        'Dev API: API key authentication failed for license listing',
        {
          requestId,
          teamId,
          responseTimeMs: responseTime,
          statusCode: HttpStatus.UNAUTHORIZED,
          ipAddress,
          userAgent,
        },
      );

      return NextResponse.json(
        {
          data: null,
          result: {
            details: 'Invalid API key',
            timestamp: new Date(),
            valid: false,
          },
        },
        {
          status: HttpStatus.UNAUTHORIZED,
        },
      );
    }

    const searchParams = request.nextUrl.searchParams;

    const MAX_PAGE_SIZE = 100;
    const DEFAULT_PAGE_SIZE = 25;
    const DEFAULT_PAGE = 1;
    const DEFAULT_SORT_DIRECTION = 'desc' as const;
    const DEFAULT_SORT_COLUMN = 'createdAt';

    const allowedPageSizes = [10, 25, 50, 100];
    const allowedSortDirections = ['asc', 'desc'] as const;
    const allowedSortColumns = ['createdAt', 'updatedAt'] as const;

    // Parse and validate parameters
    const rawPage = parseInt(searchParams.get('page') as string);
    const rawPageSize = parseInt(searchParams.get('pageSize') as string);
    const rawSortColumn = searchParams.get('sortColumn');
    const rawSortDirection = searchParams.get(
      'sortDirection',
    ) as (typeof allowedSortDirections)[number];

    const page = !isNaN(rawPage) && rawPage > 0 ? rawPage : DEFAULT_PAGE;

    const pageSize =
      !isNaN(rawPageSize) && allowedPageSizes.includes(rawPageSize)
        ? Math.min(rawPageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    const sortDirection = allowedSortDirections.includes(rawSortDirection)
      ? rawSortDirection
      : DEFAULT_SORT_DIRECTION;

    const sortColumn =
      rawSortColumn &&
      allowedSortColumns.includes(
        rawSortColumn as (typeof allowedSortColumns)[number],
      )
        ? rawSortColumn
        : DEFAULT_SORT_COLUMN;

    // Parse search and filtering parameters
    const search = searchParams.get('search') || '';
    const productIds = searchParams.get('productIds') || '';
    const customerIds = searchParams.get('customerIds') || '';
    let metadata = searchParams.get('metadataKey') as string | undefined;
    let metadataValue = searchParams.get('metadataValue') as string | undefined;
    const status = searchParams.get('status') as LicenseStatus | null;

    // Metadata validation
    if ((metadata && !metadataValue) || (!metadata && metadataValue)) {
      metadata = undefined;
      metadataValue = undefined;
    }

    if (metadata && metadataValue) {
      if (metadata.length < 1 || metadata.length > 255) {
        metadata = undefined;
        metadataValue = undefined;
      }
      if (
        metadataValue &&
        (metadataValue.length < 1 || metadataValue.length > 255)
      ) {
        metadata = undefined;
        metadataValue = undefined;
      }
    }

    const hasValidMetadata = Boolean(metadata && metadataValue);

    // Format product and customer IDs
    const productIdsFormatted = productIds
      .split(',')
      .filter((id) => regex.uuidV4.test(id));

    const customerIdsFormatted = customerIds
      .split(',')
      .filter((id) => regex.uuidV4.test(id));

    const skip = (page - 1) * pageSize;

    // License key search support
    const isFullLicense = search.match(regex.licenseKey);
    const licenseKeyLookup = isFullLicense
      ? generateHMAC(`${search}:${teamId}`)
      : undefined;

    // Status filtering
    const currentDate = new Date();
    const thirtyDaysAgo = new Date(
      currentDate.getTime() - 30 * 24 * 60 * 60 * 1000,
    );

    let statusFilter: Prisma.LicenseWhereInput = {};

    if (status) {
      switch (status) {
        case LicenseStatus.ACTIVE:
          statusFilter = {
            suspended: false,
            lastActiveAt: {
              gt: thirtyDaysAgo,
            },
            OR: [
              { expirationType: 'NEVER' },
              {
                AND: [
                  {
                    expirationType: {
                      in: ['DATE', 'DURATION'],
                    },
                  },
                  {
                    expirationDate: {
                      gt: currentDate,
                    },
                  },
                  {
                    expirationDate: {
                      gt: new Date(
                        currentDate.getTime() + 30 * 24 * 60 * 60 * 1000,
                      ),
                    },
                  },
                ],
              },
            ],
          };
          break;
        case LicenseStatus.INACTIVE:
          statusFilter = {
            suspended: false,
            lastActiveAt: {
              lte: thirtyDaysAgo,
            },
            OR: [
              { expirationType: 'NEVER' },
              {
                AND: [
                  { expirationType: { in: ['DATE', 'DURATION'] } },
                  {
                    expirationDate: {
                      gt: currentDate,
                    },
                  },
                  {
                    expirationDate: {
                      gt: new Date(
                        currentDate.getTime() + 30 * 24 * 60 * 60 * 1000,
                      ),
                    },
                  },
                ],
              },
            ],
          };
          break;
        case LicenseStatus.EXPIRING:
          statusFilter = {
            suspended: false,
            expirationType: {
              in: ['DATE', 'DURATION'],
            },
            expirationDate: {
              gt: currentDate,
              lt: new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000),
            },
          };
          break;
        case LicenseStatus.EXPIRED:
          statusFilter = {
            suspended: false,
            expirationType: {
              in: ['DATE', 'DURATION'],
            },
            expirationDate: {
              lt: currentDate,
            },
          };
          break;
        case LicenseStatus.SUSPENDED:
          statusFilter = {
            suspended: true,
          };
          break;
      }
    }

    const where = {
      ...statusFilter,
      teamId,
      licenseKeyLookup,
      products: productIdsFormatted.length
        ? {
            some: {
              id: {
                in: productIdsFormatted,
              },
            },
          }
        : undefined,
      customers: customerIdsFormatted.length
        ? {
            some: {
              id: {
                in: customerIdsFormatted,
              },
            },
          }
        : undefined,
      metadata: hasValidMetadata
        ? {
            some: {
              key: metadata,
              value: {
                contains: metadataValue,
                mode: 'insensitive',
              },
            },
          }
        : undefined,
    } as Prisma.LicenseWhereInput;

    // Get total count and licenses
    const [totalResults, licenses] = await prisma.$transaction([
      prisma.license.count({ where }),
      prisma.license.findMany({
        where,
        skip,
        take: pageSize + 1,
        orderBy: {
          [sortColumn]: sortDirection,
        },
        include: {
          products: true,
          customers: true,
          metadata: true,
        },
      }),
    ]);

    const hasNextPage = licenses.length > pageSize;

    const formattedLicenses = licenses.slice(0, pageSize).map((license) => ({
      ...license,
      licenseKey: decryptLicenseKey(license.licenseKey),
      licenseKeyLookup: undefined,
    }));

    const response: IExternalDevResponse = {
      data: {
        hasNextPage,
        totalResults,
        licenses: formattedLicenses,
      },
      result: {
        details: 'Licenses found',
        timestamp: new Date(),
        valid: true,
      },
    };

    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Dev API: Licenses retrieved successfully', {
      requestId,
      teamId,
      totalResults,
      returnedCount: formattedLicenses.length,
      hasNextPage,
      responseTimeMs: responseTime,
      statusCode: HttpStatus.OK,
    });

    return NextResponse.json(response);
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();

    logger.error('Dev API: Get licenses failed', {
      requestId,
      teamId,
      route: '/v1/dev/teams/[teamId]/licenses',
      error: error instanceof Error ? error.message : String(error),
      errorType: error?.constructor?.name || 'Unknown',
      responseTimeMs: responseTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      {
        data: null,
        result: {
          details: 'Internal server error',
          timestamp: new Date(),
          valid: false,
        },
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      },
    );
  }
}
