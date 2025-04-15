import { logger } from '@/lib/logging/logger';
import { z } from 'zod';

/**
 * Schema for validating environment variables
 */
export const envSchema = z.object({
  // Discord webhooks for notifications and status updates
  DISCORD_WEBHOOK_URL: z
    .string({
      required_error: 'DISCORD_WEBHOOK_URL is required',
    })
    .url({ message: 'DISCORD_WEBHOOK_URL must be a valid URL' }),
  INTERNAL_STATUS_WEBHOOK: z
    .string({
      required_error: 'INTERNAL_STATUS_WEBHOOK is required',
    })
    .url({ message: 'INTERNAL_STATUS_WEBHOOK must be a valid URL' }),

  // Watermark service configuration
  WATERMARK_SERVICE_BASE_URL: z
    .string({
      required_error: 'WATERMARK_SERVICE_BASE_URL is required',
    })
    .url({ message: 'WATERMARK_SERVICE_BASE_URL must be a valid URL' }),

  // Internal API security
  INTERNAL_API_KEY: z
    .string({
      required_error: 'INTERNAL_API_KEY is required',
    })
    .min(1, { message: 'INTERNAL_API_KEY is required' }),

  // Redis configuration
  REDIS_PORT: z
    .string({
      required_error: 'REDIS_PORT is required',
    })
    .optional()
    .transform((val) => val && parseInt(val, 10)),

  // Application URL
  NEXT_PUBLIC_BASE_URL: z
    .string({
      required_error: 'NEXT_PUBLIC_BASE_URL is required',
    })
    .url({ message: 'NEXT_PUBLIC_BASE_URL must be a valid URL' }),

  // Database configuration
  DATABASE_URL: z
    .string({
      required_error: 'DATABASE_URL is required',
    })
    .url({ message: 'DATABASE_URL must be a valid URL' }),
  DATABASE_USERNAME: z
    .string({
      required_error: 'DATABASE_USERNAME is required',
    })
    .min(1, { message: 'DATABASE_USERNAME is required' }),
  DATABASE_PASSWORD: z
    .string({
      required_error: 'DATABASE_PASSWORD is required',
    })
    .min(1, { message: 'DATABASE_PASSWORD is required' }),
  DATABASE_NAME: z
    .string({
      required_error: 'DATABASE_NAME is required',
    })
    .min(1, { message: 'DATABASE_NAME is required' }),

  // Security keys and tokens
  JWT_SECRET: z
    .string({
      required_error: 'JWT_SECRET is required',
    })
    .min(32, { message: 'JWT_SECRET must be at least 32 characters long' }),
  ENCRYPTION_KEY: z
    .string({
      required_error: 'ENCRYPTION_KEY is required',
    })
    .length(32, {
      message: 'ENCRYPTION_KEY must be exactly 32 characters long',
    }),
  HMAC_KEY: z
    .string({
      required_error: 'HMAC_KEY is required',
    })
    .length(32, { message: 'HMAC_KEY must be exactly 32 characters long' }),

  // SMTP configuration for email
  SMTP_HOST: z
    .string({
      required_error: 'SMTP_HOST is required',
    })
    .min(1, { message: 'SMTP_HOST is required' }),
  SMTP_PORT: z
    .string({
      required_error: 'SMTP_PORT is required',
    })
    .transform((val) => parseInt(val, 10)),
  SMTP_USER: z
    .string({
      required_error: 'SMTP_USER is required',
    })
    .min(1, { message: 'SMTP_USER is required' }),
  SMTP_PASSWORD: z
    .string({
      required_error: 'SMTP_PASSWORD is required',
    })
    .min(1, { message: 'SMTP_PASSWORD is required' }),
  SMTP_FROM: z
    .string({
      required_error: 'SMTP_FROM is required',
    })
    .email({ message: 'SMTP_FROM must be a valid email address' }),
  SMTP_FROM_NAME: z
    .string({
      required_error: 'SMTP_FROM_NAME is required',
    })
    .min(1, { message: 'SMTP_FROM_NAME is required' }),

  // OAuth - Google authentication
  GOOGLE_CLIENT_SECRET: z
    .string({
      required_error: 'GOOGLE_CLIENT_SECRET is required',
    })
    .min(1, { message: 'GOOGLE_CLIENT_SECRET is required' }),
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z
    .string({
      required_error: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID is required',
    })
    .min(1, { message: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID is required' }),
  NEXT_PUBLIC_GOOGLE_REDIRECT_URI: z
    .string({
      required_error: 'NEXT_PUBLIC_GOOGLE_REDIRECT_URI is required',
    })
    .url({ message: 'NEXT_PUBLIC_GOOGLE_REDIRECT_URI must be a valid URL' }),

  // Cloudflare Turnstile (CAPTCHA alternative)
  TURNSTILE_SECRET: z
    .string({
      required_error: 'TURNSTILE_SECRET is required',
    })
    .min(1, { message: 'TURNSTILE_SECRET is required' }),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z
    .string({
      required_error: 'NEXT_PUBLIC_TURNSTILE_SITE_KEY is required',
    })
    .min(1, { message: 'NEXT_PUBLIC_TURNSTILE_SITE_KEY is required' }),

  // OAuth - GitHub authentication
  GITHUB_CLIENT_SECRET: z
    .string({
      required_error: 'GITHUB_CLIENT_SECRET is required',
    })
    .min(1, { message: 'GITHUB_CLIENT_SECRET is required' }),
  NEXT_PUBLIC_GITHUB_CLIENT_ID: z
    .string({
      required_error: 'NEXT_PUBLIC_GITHUB_CLIENT_ID is required',
    })
    .min(1, { message: 'NEXT_PUBLIC_GITHUB_CLIENT_ID is required' }),
  NEXT_PUBLIC_GITHUB_REDIRECT_URI: z
    .string({
      required_error: 'NEXT_PUBLIC_GITHUB_REDIRECT_URI is required',
    })
    .url({ message: 'NEXT_PUBLIC_GITHUB_REDIRECT_URI must be a valid URL' }),

  // Sentry error tracking
  SENTRY_AUTH_TOKEN: z
    .string({
      required_error: 'SENTRY_AUTH_TOKEN is required',
    })
    .min(1, { message: 'SENTRY_AUTH_TOKEN is required' }),
  SENTRY_SUPPRESS_TURBOPACK_WARNING: z
    .enum(['0', '1'], {
      required_error:
        "SENTRY_SUPPRESS_TURBOPACK_WARNING must be either '0' or '1'",
      invalid_type_error:
        "SENTRY_SUPPRESS_TURBOPACK_WARNING must be either '0' or '1'",
    })
    .optional(),

  // Public object storage (Cloudflare R2 or S3-compatible)
  PUBLIC_OBJECT_STORAGE_ENDPOINT: z
    .string({
      required_error: 'PUBLIC_OBJECT_STORAGE_ENDPOINT is required',
    })
    .url({ message: 'PUBLIC_OBJECT_STORAGE_ENDPOINT must be a valid URL' }),
  PUBLIC_OBJECT_STORAGE_BUCKET_NAME: z
    .string({
      required_error: 'PUBLIC_OBJECT_STORAGE_BUCKET_NAME is required',
    })
    .min(1, { message: 'PUBLIC_OBJECT_STORAGE_BUCKET_NAME is required' }),
  PUBLIC_OBJECT_STORAGE_ACCESS_KEY: z
    .string({
      required_error: 'PUBLIC_OBJECT_STORAGE_ACCESS_KEY is required',
    })
    .min(1, { message: 'PUBLIC_OBJECT_STORAGE_ACCESS_KEY is required' }),
  PUBLIC_OBJECT_STORAGE_SECRET_KEY: z
    .string({
      required_error: 'PUBLIC_OBJECT_STORAGE_SECRET_KEY is required',
    })
    .min(1, { message: 'PUBLIC_OBJECT_STORAGE_SECRET_KEY is required' }),
  PUBLIC_OBJECT_STORAGE_BASE_URL: z
    .string({
      required_error: 'PUBLIC_OBJECT_STORAGE_BASE_URL is required',
    })
    .url({ message: 'PUBLIC_OBJECT_STORAGE_BASE_URL must be a valid URL' }),

  // Private object storage (Cloudflare R2 or S3-compatible)
  PRIVATE_OBJECT_STORAGE_ENDPOINT: z
    .string({
      required_error: 'PRIVATE_OBJECT_STORAGE_ENDPOINT is required',
    })
    .url({ message: 'PRIVATE_OBJECT_STORAGE_ENDPOINT must be a valid URL' }),
  PRIVATE_OBJECT_STORAGE_BUCKET_NAME: z
    .string({
      required_error: 'PRIVATE_OBJECT_STORAGE_BUCKET_NAME is required',
    })
    .min(1, { message: 'PRIVATE_OBJECT_STORAGE_BUCKET_NAME is required' }),
  PRIVATE_OBJECT_STORAGE_ACCESS_KEY: z
    .string({
      required_error: 'PRIVATE_OBJECT_STORAGE_ACCESS_KEY is required',
    })
    .min(1, { message: 'PRIVATE_OBJECT_STORAGE_ACCESS_KEY is required' }),
  PRIVATE_OBJECT_STORAGE_SECRET_KEY: z
    .string({
      required_error: 'PRIVATE_OBJECT_STORAGE_SECRET_KEY is required',
    })
    .min(1, { message: 'PRIVATE_OBJECT_STORAGE_SECRET_KEY is required' }),

  // Stripe payment processing
  STRIPE_PRICE_ID: z
    .string({
      required_error: 'STRIPE_PRICE_ID is required',
    })
    .min(1, { message: 'STRIPE_PRICE_ID is required' }),
  STRIPE_PUBLIC_KEY: z
    .string({
      required_error: 'STRIPE_PUBLIC_KEY is required',
    })
    .min(1, { message: 'STRIPE_PUBLIC_KEY is required' }),
  STRIPE_SECRET_KEY: z
    .string({
      required_error: 'STRIPE_SECRET_KEY is required',
    })
    .min(1, { message: 'STRIPE_SECRET_KEY is required' }),
  STRIPE_WEBHOOK_SECRET: z
    .string({
      required_error: 'STRIPE_WEBHOOK_SECRET is required',
    })
    .min(1, { message: 'STRIPE_WEBHOOK_SECRET is required' }),

  // Discord oauth
  NEXT_PUBLIC_DISCORD_CLIENT_ID: z
    .string({
      required_error: 'DISCORD_CLIENT_ID is required',
    })
    .min(1, { message: 'DISCORD_CLIENT_ID is required' }),
  DISCORD_CLIENT_SECRET: z
    .string({
      required_error: 'DISCORD_CLIENT_SECRET is required',
    })
    .min(1, { message: 'DISCORD_CLIENT_SECRET is required' }),
  NEXT_PUBLIC_DISCORD_REDIRECT_URI: z
    .string({
      required_error: 'DISCORD_REDIRECT_URI is required',
    })
    .url({ message: 'DISCORD_REDIRECT_URI must be a valid URL' }),
});

/**
 * Type for validated environment variables
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables against the schema
 * @throws {Error} If validation fails
 */
export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(
        (issue) =>
          `${issue.path[0]}: ${issue.message.split('.').pop()?.trim() || issue.message}`,
      );
      logger.error(
        `Failed to validate environment variables: ${issues.join(', ')}`,
      );
      process.exit(1);
    }
    throw new Error('Failed to validate environment variables');
  }
}
