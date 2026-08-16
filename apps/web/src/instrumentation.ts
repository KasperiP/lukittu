import * as Sentry from '@sentry/nextjs';
import { validateEnv } from './lib/validation/shared/env-schema';

export async function register() {
  validateEnv();

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Next.js 16.3 attaches ~11 short-lived 'close' listeners to each
    // ServerResponse (abort signals, after(), stream piping), which trips
    // Node's default 10-listener warning threshold. The listeners are
    // per-request and die with the response, so this is noise rather than a
    // leak. See https://github.com/vercel/next.js/discussions/96973
    const { EventEmitter } = await import('events');
    EventEmitter.defaultMaxListeners = 32;

    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
