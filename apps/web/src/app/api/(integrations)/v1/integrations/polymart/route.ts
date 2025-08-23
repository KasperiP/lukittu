import {
  handlePolymartPurchase,
  verifyPolymartSignature,
} from '@/lib/providers/polymart-external';
import { isRateLimited } from '@/lib/security/rate-limiter';
import {
  polymartPurchaseParamsSchema,
  purchasePolymartSchema,
} from '@/lib/validation/integrations/purchase-polymart-schema';
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

  logger.info('Polymart webhook: Request started', {
    requestId,
    route: '/v1/integrations/polymart',
    method: 'POST',
    userAgent,
    timestamp: requestTime.toISOString(),
  });

  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');
    const productId = searchParams.get('productId');
    const ipLimit = searchParams.get('ipLimit')
      ? parseInt(searchParams.get('ipLimit') || '0', 10)
      : null;
    const hwidLimit = searchParams.get('hwidLimit')
      ? parseInt(searchParams.get('hwidLimit') || '0', 10)
      : null;
    const expirationDays = searchParams.get('expirationDays')
      ? parseInt(searchParams.get('expirationDays') || '0', 10)
      : null;
    const expirationStart = searchParams.get('expirationStart') as
      | 'CREATION'
      | 'ACTIVATION'
      | null;

    if (!teamId || !regex.uuidV4.test(teamId)) {
      logger.warn('Polymart webhook: Invalid teamId provided', {
        requestId,
        teamId,
        route: '/v1/integrations/polymart',
      });
      return NextResponse.json(
        {
          message: 'Invalid teamId',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    if (!productId || !regex.uuidV4.test(productId)) {
      logger.warn('Polymart webhook: Invalid productId provided', {
        requestId,
        teamId,
        productId,
      });
      return NextResponse.json(
        {
          message: 'Invalid productId',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    // Validate purchase params from query parameters
    const purchaseParamsValidation =
      await polymartPurchaseParamsSchema().safeParseAsync({
        productId,
        ipLimit,
        hwidLimit,
        expirationDays,
        expirationStart,
      });

    if (!purchaseParamsValidation.success) {
      logger.warn('Polymart webhook: Purchase params validation failed', {
        requestId,
        teamId,
        productId,
        error: purchaseParamsValidation.error.errors[0].message,
        field: purchaseParamsValidation.error.errors[0].path[0],
      });
      return NextResponse.json(
        {
          field: purchaseParamsValidation.error.errors[0].path[0],
          message: purchaseParamsValidation.error.errors[0].message,
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    const key = `polymart-integration:${teamId}`;
    const isLimited = await isRateLimited(key, 60, 10); // 60 requests per 10 seconds

    if (isLimited) {
      logger.warn('Polymart webhook: Rate limit exceeded', {
        requestId,
        teamId,
        productId,
        rateLimitKey: key,
      });
      return NextResponse.json(
        {
          message: 'Too many requests. Please try again later.',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
        deletedAt: null,
      },
      include: {
        polymartIntegration: true,
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

    if (!team || !team.polymartIntegration || !team.limits || !team.settings) {
      logger.warn('Polymart webhook: Team not found or missing configuration', {
        requestId,
        teamId,
        productId,
        hasTeam: !!team,
        hasPolymartIntegration: !!team?.polymartIntegration,
        hasLimits: !!team?.limits,
        hasSettings: !!team?.settings,
      });
      return NextResponse.json(
        {
          message: 'Team not found',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    const integration = team.polymartIntegration;

    if (!integration.active) {
      logger.warn('Polymart webhook: Integration not active', {
        requestId,
        teamId,
        productId,
        integrationId: integration.id,
        active: integration.active,
      });
      return NextResponse.json(
        {
          message: 'Polymart integration is not active',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    // Get the raw body for signature verification
    const rawBody = await request.text();
    const polymartSignature = headersList.get('x-polymart-signature');

    if (!polymartSignature) {
      logger.warn('Polymart webhook: Missing signature header', {
        requestId,
        teamId,
        productId,
      });
      return NextResponse.json(
        {
          message: 'Missing signature',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    if (!rawBody) {
      logger.warn('Polymart webhook: Missing request body', {
        requestId,
        teamId,
        productId,
      });
      return NextResponse.json(
        {
          message: 'Missing request body',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    // Verify webhook signature
    if (
      !verifyPolymartSignature({
        payload: rawBody,
        requestId,
        teamId,
        signature: polymartSignature,
        webhookSecret: integration.webhookSecret,
      })
    ) {
      logger.warn('Polymart webhook: Invalid signature', {
        requestId,
        teamId,
        productId,
        hasSignature: !!polymartSignature,
        hasWebhookSecret: !!integration.webhookSecret,
      });
      return NextResponse.json(
        {
          message: 'Invalid signature',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    // Parse the raw body as JSON for validation
    let polymartData: Record<string, unknown>;
    try {
      polymartData = JSON.parse(rawBody);
    } catch (error) {
      logger.warn('Polymart webhook: Failed to parse request body', {
        requestId,
        teamId,
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        {
          message: 'Invalid request body',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    // Validate the webhook payload
    const validatedData =
      await purchasePolymartSchema().safeParseAsync(polymartData);

    if (!validatedData.success) {
      logger.warn('Polymart webhook: Payload validation failed', {
        requestId,
        teamId,
        productId,
        error: validatedData.error.errors[0].message,
        field: validatedData.error.errors[0].path[0],
        errors: validatedData.error.errors.slice(0, 3),
      });
      return NextResponse.json(
        {
          field: validatedData.error.errors[0].path[0],
          message: validatedData.error.errors[0].message,
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    // Only process product.user.purchase events. This is also validated in the schema.
    if (validatedData.data.event !== 'product.user.purchase') {
      logger.info('Polymart webhook: Skipping non-purchase event', {
        requestId,
        teamId,
        productId,
        eventType: validatedData.data.event,
      });
      return NextResponse.json({
        success: true,
        message: 'Event ignored - not a purchase event',
      });
    }

    const startTime = Date.now();

    // Handle the purchase
    const result = await handlePolymartPurchase(
      requestId,
      validatedData.data,
      purchaseParamsValidation.data,
      team,
    );

    const processingTime = Date.now() - startTime;
    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Polymart webhook: Completed', {
      requestId,
      teamId,
      productId,
      eventType: validatedData.data.event,
      success: result.success,
      processingTimeMs: processingTime,
      responseTimeMs: responseTime,
      message: result.message,
      polymartUserId: validatedData.data.payload.user.id,
      polymartProductId: validatedData.data.payload.product.id,
    });

    return NextResponse.json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');
    const productId = searchParams.get('productId');

    logger.error('Polymart webhook: Failed', {
      requestId,
      teamId,
      productId,
      route: '/v1/integrations/polymart',
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      responseTimeMs: responseTime,
      userAgent,
    });

    return NextResponse.json(
      {
        message: 'An error occurred while processing the request',
      },
      { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
    );
  }
}
