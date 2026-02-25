import { handleBuiltByBitPurchase } from '@/lib/providers/built-by-bit-external';
import { isRateLimited } from '@/lib/security/rate-limiter';
import {
  purchaseBuiltByBitSchema,
  PurchaseBuiltByBitSchema,
} from '@/lib/validation/integrations/purchase-built-by-bit-schema';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma, regex } from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';

  logger.info('BuiltByBit webhook: Request started', {
    requestId,
    route: '/v1/integrations/built-by-bit',
    method: 'POST',
    userAgent,
    timestamp: requestTime.toISOString(),
  });

  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');

    if (!teamId || !regex.uuidV4.test(teamId)) {
      logger.warn('BuiltByBit webhook: Invalid teamId provided', {
        requestId,
        teamId,
        route: '/v1/integrations/built-by-bit',
      });
      return NextResponse.json(
        {
          message: 'Invalid teamId',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying the request
      );
    }

    const key = `built-by-bit-integration:${teamId}`;
    const isLimited = await isRateLimited(key, 60, 10); // 60 requests per 10 seconds

    if (isLimited) {
      logger.warn('BuiltByBit webhook: Rate limit exceeded', {
        requestId,
        teamId,
        rateLimitKey: key,
      });
      return NextResponse.json(
        {
          message: 'Too many requests. Please try again later.',
        },
        { status: HttpStatus.TOO_MANY_REQUESTS },
      );
    }

    const rawBody = (await request.json()) as PurchaseBuiltByBitSchema;

    /**
     * @deprecated use hwidLimit. Only for backward compatibility.
     */
    const legacySeats = (rawBody.lukittuData as any).seats as
      | string
      | undefined;

    const body = {
      ...rawBody,
      lukittuData: {
        productId: rawBody.lukittuData.productId,
        ipLimit: rawBody.lukittuData.ipLimit,
        hwidLimit: rawBody.lukittuData.hwidLimit || legacySeats,
        expirationDays: rawBody.lukittuData.expirationDays,
        expirationStart: rawBody.lukittuData.expirationStart,
      },
    };

    logger.info('BuiltByBit webhook: Payload received', body);

    const validated = await purchaseBuiltByBitSchema().safeParseAsync(body);

    if (!validated.success) {
      logger.warn('BuiltByBit webhook: Payload validation failed', {
        requestId,
        teamId,
        error: validated.error.errors[0].message,
        field: validated.error.errors[0].path[0],
        errors: validated.error.errors.slice(0, 3),
      });
      return NextResponse.json(
        {
          field: validated.error.errors[0].path[0],
          message: validated.error.errors[0].message,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { apiSecret, builtByBitData, lukittuData } = validated.data;

    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
        deletedAt: null,
      },
      include: {
        builtByBitIntegration: true,
        settings: true,
        limits: true,
        _count: {
          select: {
            licenses: true,
            customers: true,
          },
        },
      },
    });

    if (
      !team ||
      !team.builtByBitIntegration ||
      !team.limits ||
      !team.settings
    ) {
      logger.warn(
        'BuiltByBit webhook: Team not found or missing configuration',
        {
          requestId,
          teamId,
          hasTeam: !!team,
          hasBuiltByBitIntegration: !!team?.builtByBitIntegration,
          hasLimits: !!team?.limits,
          hasSettings: !!team?.settings,
        },
      );
      return NextResponse.json(
        {
          message: 'Team not found',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying the request
      );
    }

    const integration = team.builtByBitIntegration;

    const isValid = crypto.timingSafeEqual(
      Buffer.from(apiSecret),
      Buffer.from(integration.apiSecret),
    );
    if (!isValid) {
      logger.warn('BuiltByBit webhook: Invalid API secret', {
        requestId,
        teamId,
        integrationId: integration.id,
        hasApiSecret: !!apiSecret,
      });
      return NextResponse.json(
        {
          message: 'Invalid API secret',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying the request
      );
    }

    if (!integration.active) {
      logger.warn('BuiltByBit webhook: Integration not active', {
        requestId,
        teamId,
        integrationId: integration.id,
        active: integration.active,
      });
      return NextResponse.json(
        {
          message: 'BuiltByBit integration is not active',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying the request
      );
    }

    const startTime = Date.now();

    const result = await handleBuiltByBitPurchase(
      requestId,
      builtByBitData,
      lukittuData,
      team,
    );

    const processingTime = Date.now() - startTime;
    const responseTime = Date.now() - requestTime.getTime();

    logger.info('BuiltByBit webhook: Completed', {
      requestId,
      teamId,
      success: result.success,
      processingTimeMs: processingTime,
      responseTimeMs: responseTime,
      message: result.message,
      bbbUserId: builtByBitData.user.id,
      bbbResourceId: builtByBitData.resource.id,
      productId: lukittuData.productId,
    });

    // Might be error but we return 200 to prevent BuiltByBit from retrying the request.
    return NextResponse.json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');

    logger.error('BuiltByBit webhook: Failed', {
      requestId,
      teamId,
      route: '/v1/integrations/built-by-bit',
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      responseTimeMs: responseTime,
      userAgent,
    });

    return NextResponse.json(
      {
        message: 'An error occurred while processing the request',
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
