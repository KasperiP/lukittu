import { handleBuiltByBitPurchase } from '@/lib/providers/built-by-bit-external';
import { isRateLimited } from '@/lib/security/rate-limiter';
import {
  purchaseBuiltByBitSchema,
  PurchaseBuiltByBitSchema,
} from '@/lib/validation/integrations/purchase-built-by-bit-schema';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma, regex } from '@lukittu/shared';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');

    if (!teamId || !regex.uuidV4.test(teamId)) {
      logger.error('Invalid teamId', { teamId });
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
      logger.error('Rate limited', { key });
      return NextResponse.json(
        {
          message: 'Too many requests. Please try again later.',
        },
        { status: HttpStatus.TOO_MANY_REQUESTS },
      );
    }

    const body = (await request.json()) as PurchaseBuiltByBitSchema;
    const validated = await purchaseBuiltByBitSchema().safeParseAsync(body);

    if (!validated.success) {
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
      logger.error('Team not found or missing required fields', { teamId });
      return NextResponse.json(
        {
          message: 'Team not found',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying the request
      );
    }

    const integration = team.builtByBitIntegration;

    if (apiSecret !== integration.apiSecret) {
      logger.error('Invalid API secret', { teamId });
      return NextResponse.json(
        {
          message: 'Invalid API secret',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying the request
      );
    }

    if (!integration.active) {
      logger.error('BuiltByBit integration is not active', { teamId });
      return NextResponse.json(
        {
          message: 'BuiltByBit integration is not active',
        },
        { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying the request
      );
    }

    const result = await handleBuiltByBitPurchase(
      builtByBitData,
      lukittuData,
      team,
    );

    // Might be error but we return 200 to prevent BuiltByBit from retrying the request.
    return NextResponse.json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    logger.error(
      "Error occurred in '(integrations)/v1/integrations/built-by-bit' route",
      error,
    );

    return NextResponse.json(
      {
        message: 'An error occurred while processing the request',
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
