import {
  handlePolymartPlaceholder,
  verifyPolymartSignature,
} from '@/lib/providers/polymart-external';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { placeholderPolymartSchema } from '@/lib/validation/integrations/placeholder-polymart-schema';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma, regex } from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
): Promise<NextResponse | Response> {
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'unknown';
  const searchParams = request.nextUrl.searchParams;
  const teamId = searchParams.get('teamId');

  logger.info('Polymart placeholder: Webhook request started', {
    requestId,
    route: '/v1/integrations/polymart/placeholder',
    method: 'POST',
    userAgent,
    timestamp: requestTime.toISOString(),
  });

  try {
    if (!teamId || !regex.uuidV4.test(teamId)) {
      logger.warn('Polymart placeholder: Invalid teamId provided', {
        requestId,
        teamId,
        route: '/v1/integrations/polymart/placeholder',
      });
      return NextResponse.json(
        {
          message: 'Invalid teamId',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    const key = `polymart-integration:${teamId}`;
    const isLimited = await isRateLimited(key, 60, 10); // 60 requests per 10 seconds

    if (isLimited) {
      logger.warn('Polymart placeholder: Rate limit exceeded', {
        requestId,
        teamId,
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
      },
    });

    if (!team || !team.polymartIntegration) {
      logger.warn(
        'Polymart placeholder: Team not found or missing integration',
        {
          requestId,
          teamId,
          hasTeam: !!team,
          hasPolymartIntegration: !!team?.polymartIntegration,
        },
      );
      return NextResponse.json(
        {
          message: 'Team not found',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    const polymartIntegration = team.polymartIntegration;

    if (!polymartIntegration.active) {
      logger.warn('Polymart placeholder: Integration not active', {
        requestId,
        teamId,
        integrationId: polymartIntegration.id,
        active: polymartIntegration.active,
      });
      return NextResponse.json(
        {
          message: 'Polymart integration not active',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    // Get the raw body for signature verification
    const rawBody = await request.text();
    const polymartSignature = headersList.get('x-polymart-signature');

    if (!polymartSignature) {
      logger.warn('Polymart placeholder: Missing signature header', {
        requestId,
        teamId,
      });
      return NextResponse.json(
        {
          message: 'Missing signature header',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    if (!rawBody) {
      logger.warn('Polymart placeholder: Missing request body', {
        requestId,
        teamId,
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
        webhookSecret: polymartIntegration.webhookSecret,
      })
    ) {
      logger.warn('Polymart placeholder: Invalid signature', {
        requestId,
        teamId,
        hasSignature: !!polymartSignature,
        hasWebhookSecret: !!polymartIntegration.webhookSecret,
      });
      return NextResponse.json(
        {
          message: 'Invalid signature',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    // Parse the raw body as JSON for validation
    let requestData: Record<string, unknown>;
    try {
      requestData = JSON.parse(rawBody);
    } catch (error) {
      logger.warn('Polymart placeholder: Failed to parse request body', {
        requestId,
        teamId,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        {
          message: 'Invalid JSON in request body',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    logger.info('Polymart placeholder: Received data', {
      requestId,
      teamId,
      data: requestData,
    });

    const validated =
      await placeholderPolymartSchema().safeParseAsync(requestData);

    if (!validated.success) {
      logger.warn('Polymart placeholder: Payload validation failed', {
        requestId,
        teamId,
        error: validated.error.errors[0].message,
        field: validated.error.errors[0].path[0],
        errors: validated.error.errors.slice(0, 3),
      });
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.OK }, // Return 200 to prevent Polymart from retrying the request
      );
    }

    const startTime = Date.now();
    const result = await handlePolymartPlaceholder(
      requestId,
      validated.data,
      teamId,
    );
    const processingTime = Date.now() - startTime;
    const responseTime = Date.now() - requestTime.getTime();

    logger.info('Polymart placeholder: Completed', {
      requestId,
      teamId,
      success: !('status' in result),
      processingTimeMs: processingTime,
      responseTimeMs: responseTime,
      message: 'status' in result ? result.message : 'Success',
    });

    if ('status' in result) {
      return NextResponse.json(result.message, { status: result.status });
    }

    return NextResponse.json(
      {
        value: result.value,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
        },
      },
    );
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();
    logger.error('Polymart placeholder: Failed', {
      requestId,
      teamId,
      route: '/v1/integrations/polymart/placeholder',
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      responseTimeMs: responseTime,
      userAgent,
    });
    return NextResponse.json(
      {
        message: 'Internal server error',
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
