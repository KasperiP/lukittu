import { HttpStatus } from '@/types/http-status';
import { logger, processWebhookRetries } from '@lukittu/shared';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  const startTime = Date.now();

  const reqHeaders = await headers();
  const authorizationHeader = reqHeaders.get('authorization');

  if (authorizationHeader !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: HttpStatus.UNAUTHORIZED },
    );
  }

  try {
    // Process retries with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error('Webhook retry processing timeout')),
        25000, // 25 seconds
      );
    });

    const processPromise = processWebhookRetries();

    // Race between processing and timeout
    const processedCount = (await Promise.race([
      processPromise,
      timeoutPromise,
    ])) as number;

    const duration = Date.now() - startTime;
    logger.info('Webhook retry processing complete', {
      processedCount,
      durationMs: duration,
    });

    return NextResponse.json({
      success: true,
      processedCount,
      durationMs: duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Failed to process webhook retries', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      durationMs: duration,
    });

    // Return 500 but don't expose error details
    return NextResponse.json(
      {
        message: 'Internal server error',
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
