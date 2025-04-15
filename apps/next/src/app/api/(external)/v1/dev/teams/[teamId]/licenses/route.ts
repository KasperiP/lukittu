import { regex } from '@/lib/constants/regex';
import prisma from '@/lib/database/prisma';
import { sendLicenseDistributionEmail } from '@/lib/emails/templates/send-license-distribution-email';
import { generateUniqueLicense } from '@/lib/licenses/generate-license';
import { createAuditLog } from '@/lib/logging/audit-log';
import { logger } from '@/lib/logging/logger';
import { verifyApiAuthorization } from '@/lib/security/api-key-auth';
import {
  decryptLicenseKey,
  encryptLicenseKey,
  generateHMAC,
} from '@/lib/security/crypto';
import { isRateLimited } from '@/lib/security/rate-limiter';
import {
  CreateLicenseSchema,
  createLicenseSchema,
} from '@/lib/validation/licenses/set-license-schema';
import { IExternalDevResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { AuditLogAction, AuditLogTargetType, Prisma } from '@lukittu/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ teamId: string }> },
): Promise<NextResponse<IExternalDevResponse>> {
  const params = await props.params;

  try {
    const { teamId } = params;

    const body = (await request.json()) as CreateLicenseSchema;
    const validated = await createLicenseSchema().safeParseAsync(body);

    if (!validated.success) {
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
      seats,
      suspended,
      sendEmailDelivery,
    } = body;

    const { team } = await verifyApiAuthorization(teamId);

    if (!team) {
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

    const licenseAmount = await prisma.license.count({
      where: {
        teamId,
      },
    });

    if (licenseAmount >= team.limits.maxLicenses) {
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

    const license = await prisma.$transaction(async (tx) => {
      const license = await prisma.license.create({
        data: {
          expirationDate,
          expirationDays,
          expirationStart: expirationStart || 'CREATION',
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
          seats,
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
          .map((customer) => customer.email)
          .filter(Boolean) as string[];

        if (customerEmails.length) {
          const key = `email-delivery:${team.id}`;
          const isLimited = await isRateLimited(key, 50, 86400); // 50 requests per day
          if (isLimited) {
            logger.error(
              `Rate limit exceeded for email delivery for team ${team.id}`,
            );
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
              `Failed to send email delivery for license ${license.id}`,
            );
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
        }
      }

      return license;
    });

    if (license instanceof NextResponse) {
      return license;
    }

    const response: IExternalDevResponse = {
      data: {
        ...license,
        licenseKey,
        licenseKeyLookup: undefined,
      },
      result: {
        details: 'License created',
        timestamp: new Date(),
        valid: true,
      },
    };

    createAuditLog({
      system: true,
      teamId: team.id,
      action: AuditLogAction.CREATE_LICENSE,
      targetId: license.id,
      targetType: AuditLogTargetType.LICENSE,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      "Error in '(external)/v1/dev/teams/[teamId]/licenses' route",
      error,
    );

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

  try {
    const { teamId } = params;

    const { team } = await verifyApiAuthorization(teamId);

    if (!team) {
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

    const rawPage = parseInt(searchParams.get('page') as string);
    const rawPageSize = parseInt(searchParams.get('pageSize') as string);
    const rawSortColumn = searchParams.get('sortColumn');
    const rawSortDirection = searchParams.get(
      'sortDirection',
    ) as (typeof allowedSortDirections)[number];

    // Validate and sanitize input parameters
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

    const productIds = searchParams.get('productIds') || '';
    const customerIds = searchParams.get('customerIds') || '';

    const productIdsFormatted = productIds
      .split(',')
      .filter((id) => regex.uuidV4.test(id));

    const customerIdsFormatted = customerIds
      .split(',')
      .filter((id) => regex.uuidV4.test(id));

    const skip = (page - 1) * pageSize;

    const where = {
      teamId,
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
    } as Prisma.LicenseWhereInput;

    const licenses = await prisma.license.findMany({
      where,
      skip,
      take: pageSize + 1,
      orderBy: {
        [sortColumn]: sortDirection,
      },
      include: {
        metadata: true,
      },
    });

    const hasNextPage = licenses.length > pageSize;

    const formattedLicenses = licenses.slice(0, pageSize).map((license) => ({
      ...license,
      licenseKey: decryptLicenseKey(license.licenseKey),
    }));

    const response: IExternalDevResponse = {
      data: {
        hasNextPage,
        licenses: formattedLicenses,
      },
      result: {
        details: 'Licenses found',
        timestamp: new Date(),
        valid: true,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      "Error in '(external)/v1/dev/teams/[teamId]/licenses' route",
      error,
    );
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
