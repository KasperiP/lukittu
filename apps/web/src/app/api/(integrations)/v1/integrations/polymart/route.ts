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
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');
    const productId = searchParams.get('productId');
    const ipLimit = searchParams.get('ipLimit')
      ? parseInt(searchParams.get('ipLimit') || '0', 10)
      : null;
    const seats = searchParams.get('seats')
      ? parseInt(searchParams.get('seats') || '0', 10)
      : null;
    const expirationDays = searchParams.get('expirationDays')
      ? parseInt(searchParams.get('expirationDays') || '0', 10)
      : null;
    const expirationStart = searchParams.get('expirationStart') as
      | 'CREATION'
      | 'ACTIVATION'
      | null;

    logger.info('Received Polymart webhook request', {
      teamId,
      productId,
      ipLimit,
      seats,
      expirationDays,
      expirationStart,
    });

    if (!teamId || !regex.uuidV4.test(teamId)) {
      logger.error('Invalid teamId in Polymart webhook', { teamId });
      return NextResponse.json(
        {
          message: 'Invalid teamId',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    if (!productId || !regex.uuidV4.test(productId)) {
      logger.error('Invalid productId in Polymart webhook', { productId });
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
        seats,
        expirationDays,
        expirationStart,
      });

    if (!purchaseParamsValidation.success) {
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
      logger.error('Rate limited Polymart webhook request', { key, teamId });
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
      logger.error(
        'Team not found or missing required configuration for Polymart integration',
        {
          teamId,
          teamFound: !!team,
          polymartIntegrationExists: !!team?.polymartIntegration,
          limitsExist: !!team?.limits,
          settingsExist: !!team?.settings,
        },
      );
      return NextResponse.json(
        {
          message: 'Team not found',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    const integration = team.polymartIntegration;

    if (!integration.active) {
      logger.error('Polymart integration is not active', { teamId });
      return NextResponse.json(
        {
          message: 'Polymart integration is not active',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    // Get the raw body for signature verification
    const rawBody = await request.text();
    const headersList = await headers();
    const polymartSignature = headersList.get('x-polymart-signature');

    if (!polymartSignature) {
      logger.error('Missing Polymart signature header', { teamId });
      return NextResponse.json(
        {
          message: 'Missing signature',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    if (!rawBody) {
      logger.error('Missing request body', { teamId });
      return NextResponse.json(
        {
          message: 'Missing request body',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    // Verify webhook signature
    if (
      !verifyPolymartSignature(
        rawBody,
        polymartSignature,
        integration.webhookSecret,
      )
    ) {
      logger.error('Invalid Polymart signature', { teamId });
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
      logger.error('Failed to parse request body', { error });
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
      logger.error('Invalid Polymart payload', {
        errors: validatedData.error.errors,
        teamId,
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
      logger.info('Skipping non-purchase event', {
        event: validatedData.data.event,
        teamId,
      });
      return NextResponse.json({
        success: true,
        message: 'Event ignored - not a purchase event',
      });
    }

    // Handle the purchase
    const result = await handlePolymartPurchase(
      validatedData.data,
      purchaseParamsValidation.data,
      team,
    );

    return NextResponse.json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    logger.error('Error processing Polymart webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        message: 'An error occurred while processing the request',
      },
      { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
    );
  }
}
