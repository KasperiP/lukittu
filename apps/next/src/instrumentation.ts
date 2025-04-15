import * as Sentry from '@sentry/nextjs';
import { validateEnv } from './lib/validation/shared/env-schema';

export async function register() {
  validateEnv();

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
