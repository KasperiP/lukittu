import { handleBuiltByBitPlaceholder } from '@/lib/providers/built-by-bit-external';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { placeholderBuiltByBitSchema } from '@/lib/validation/integrations/placeholder-built-by-bit-schema';
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

  const key = `built-by-bit-integration:${teamId}`;
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
      builtByBitIntegration: true,
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

  const builtByBitIntegration = team.builtByBitIntegration;

  if (!builtByBitIntegration) {
    logger.error('BuiltByBit integration not found', { teamId });
    return NextResponse.json(
      {
        message: 'BuiltByBit integration not found',
      },
      { status: HttpStatus.NOT_FOUND },
    );
  }

  if (!builtByBitIntegration.active) {
    logger.error('BuiltByBit integration not active', { teamId });
    return NextResponse.json(
      {
        message: 'BuiltByBit integration not active',
      },
      { status: HttpStatus.BAD_REQUEST },
    );
  }

  try {
    const formData = await request.formData();
    const formDataObject: Record<string, string> = {};

    for (const [key, value] of formData.entries()) {
      formDataObject[key] = value.toString();
    }

    logger.info('Received placeholder data from BuiltByBit', {
      teamId,
      formData: formDataObject,
    });

    const validated =
      await placeholderBuiltByBitSchema().safeParseAsync(formDataObject);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { secret } = validated.data;

    if (secret !== builtByBitIntegration.apiSecret) {
      logger.error('Invalid API secret', { teamId });
      return NextResponse.json(
        {
          message: 'Invalid API secret',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const result = await handleBuiltByBitPlaceholder(validated.data, teamId);

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
    logger.error('Error processing form data', { error });
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
      },
      { status: HttpStatus.BAD_REQUEST },
    );
  }
}
