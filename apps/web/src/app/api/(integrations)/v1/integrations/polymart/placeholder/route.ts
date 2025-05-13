import {
  handlePolymartPlaceholder,
  verifyPolymartSignature,
} from '@/lib/providers/polymart-external';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { placeholderPolymartSchema } from '@/lib/validation/integrations/placeholder-polymart-schema';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma, regex } from '@lukittu/shared';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
): Promise<NextResponse | Response> {
  const searchParams = request.nextUrl.searchParams;
  const teamId = searchParams.get('teamId');

  if (!teamId || !regex.uuidV4.test(teamId)) {
    logger.error('Invalid teamId', { teamId });
    return NextResponse.json(
      {
        message: 'Invalid teamId',
      },
      { status: HttpStatus.BAD_REQUEST },
    );
  }

  const key = `polymart-integration:${teamId}`;
  const isLimited = await isRateLimited(key, 60, 10); // 60 requests per 10 seconds

  if (isLimited) {
    logger.error('Rate limited', { key });
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
      polymartIntegration: true,
    },
  });

  if (!team) {
    logger.error('Team not found', { teamId });
    return NextResponse.json(
      {
        message: 'Team not found',
      },
      { status: HttpStatus.NOT_FOUND },
    );
  }

  const polymartIntegration = team.polymartIntegration;

  if (!polymartIntegration) {
    logger.error('Polymart integration not found', { teamId });
    return NextResponse.json(
      {
        message: 'Polymart integration not found',
      },
      { status: HttpStatus.NOT_FOUND },
    );
  }

  if (!polymartIntegration.active) {
    logger.error('Polymart integration not active', { teamId });
    return NextResponse.json(
      {
        message: 'Polymart integration not active',
      },
      { status: HttpStatus.BAD_REQUEST },
    );
  }

  try {
    // Get the raw body for signature verification
    const rawBody = await request.text();
    const polymartSignature = request.headers.get('x-polymart-signature');

    if (!polymartSignature) {
      logger.error('Missing Polymart signature header', { teamId });
      return NextResponse.json(
        {
          message: 'Missing signature header',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Verify webhook signature
    if (
      !verifyPolymartSignature(
        rawBody,
        polymartSignature,
        polymartIntegration.apiSecret,
      )
    ) {
      logger.error('Invalid Polymart signature', { teamId });
      return NextResponse.json(
        {
          message: 'Invalid signature',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Parse the raw body as JSON for validation
    let requestData: Record<string, unknown>;
    try {
      requestData = JSON.parse(rawBody);
    } catch (error) {
      logger.error('Invalid JSON in request body', { error, teamId });
      return NextResponse.json(
        {
          message: 'Invalid JSON in request body',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    logger.info('Received placeholder data from Polymart', {
      teamId,
      data: requestData,
    });

    const validated =
      await placeholderPolymartSchema().safeParseAsync(requestData);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const result = await handlePolymartPlaceholder(validated.data, teamId);

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
    logger.error('Error processing placeholder request', { error, teamId });
    return NextResponse.json(
      {
        message: 'Internal server error',
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
