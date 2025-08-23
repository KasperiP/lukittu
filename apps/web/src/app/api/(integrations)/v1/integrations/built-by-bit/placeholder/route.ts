import { handleBuiltByBitPlaceholder } from '@/lib/providers/built-by-bit-external';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { placeholderBuiltByBitSchema } from '@/lib/validation/integrations/placeholder-built-by-bit-schema';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma, regex } from '@lukittu/shared';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
): Promise<NextResponse | Response> {
  const requestTime = new Date();
  const requestId = crypto.randomUUID();
  const searchParams = request.nextUrl.searchParams;
  const teamId = searchParams.get('teamId');

  logger.info('BuiltByBit placeholder: Request started', {
    requestId,
    route: '/v1/integrations/built-by-bit/placeholder',
    method: 'POST',
    timestamp: requestTime.toISOString(),
  });

  try {
    if (!teamId || !regex.uuidV4.test(teamId)) {
      logger.warn('BuiltByBit placeholder: Invalid teamId provided', {
        requestId,
        teamId,
        route: '/v1/integrations/built-by-bit/placeholder',
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
      logger.warn('BuiltByBit placeholder: Rate limit exceeded', {
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

    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
        deletedAt: null,
      },
      include: {
        builtByBitIntegration: true,
      },
    });

    if (!team || !team.builtByBitIntegration) {
      logger.warn(
        'BuiltByBit placeholder: Team not found or missing integration',
        {
          requestId,
          teamId,
          hasTeam: !!team,
          hasBuiltByBitIntegration: !!team?.builtByBitIntegration,
        },
      );
      return NextResponse.json(
        {
          message: 'Team not found',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying the request
      );
    }

    const builtByBitIntegration = team.builtByBitIntegration;

    if (!builtByBitIntegration.active) {
      logger.warn('BuiltByBit placeholder: Integration not active', {
        requestId,
        teamId,
        integrationId: builtByBitIntegration.id,
        active: builtByBitIntegration.active,
      });
      return NextResponse.json(
        {
          message: 'BuiltByBit integration not active',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying the request
      );
    }

    const formData = await request.formData();
    const formDataObject: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      formDataObject[key] = value.toString();
    }

    logger.info('BuiltByBit placeholder: Received data', {
      requestId,
      teamId,
      formData: formDataObject,
    });

    const validated =
      await placeholderBuiltByBitSchema().safeParseAsync(formDataObject);

    if (!validated.success) {
      logger.warn('BuiltByBit placeholder: Payload validation failed', {
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
        { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying the request
      );
    }

    const { secret } = validated.data;

    if (secret !== builtByBitIntegration.apiSecret) {
      logger.warn('BuiltByBit placeholder: Invalid API secret', {
        requestId,
        teamId,
        integrationId: builtByBitIntegration.id,
        hasApiSecret: !!secret,
      });
      return NextResponse.json(
        {
          message: 'Invalid API secret',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying the request
      );
    }

    const startTime = Date.now();
    const result = await handleBuiltByBitPlaceholder(
      requestId,
      validated.data,
      teamId,
    );
    const processingTime = Date.now() - startTime;
    const responseTime = Date.now() - requestTime.getTime();

    logger.info('BuiltByBit placeholder: Completed', {
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

    return new Response(result.licenseKey, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (error) {
    const responseTime = Date.now() - requestTime.getTime();
    logger.error('BuiltByBit placeholder: Failed', {
      requestId,
      teamId,
      route: '/v1/integrations/built-by-bit/placeholder',
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      responseTimeMs: responseTime,
    });
    return NextResponse.json(
      {
        message: 'Internal server error',
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
