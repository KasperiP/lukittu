import { isRateLimited } from '@/lib/security/rate-limiter';
import { getSession } from '@/lib/security/session';
import { getIp, getLanguage } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  SetupTwoFactorSchema,
  setupTwoFactorSchema,
} from '@/lib/validation/two-factor/setup-two-factor-schema';
import {
  createTOTPUri,
  encryptTOTPSecret,
  generateTOTPSecret,
  logger,
  Provider,
  redisClient,
  verifyPassword,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export interface ITwoFactorSetupSuccessResponse {
  secret: string;
  qrCodeUri: string;
}

export type ITwoFactorSetupResponse =
  | ErrorResponse
  | ITwoFactorSetupSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ITwoFactorSetupResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as SetupTwoFactorSchema;
    const validated = await setupTwoFactorSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Rate limiting for two-factor setup
    const ip = await getIp();
    if (ip) {
      const key = `two-factor-setup:${ip}`;
      const isLimited = await isRateLimited(key, 10, 300); // 10 requests per 5 minutes

      if (isLimited) {
        return NextResponse.json(
          {
            message: t('validation.too_many_requests'),
          },
          { status: HttpStatus.TOO_MANY_REQUESTS },
        );
      }
    }

    const session = await getSession({
      user: {
        omit: {
          passwordHash: false,
        },
        include: {
          totp: {
            omit: {
              secret: false,
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (session.user.provider !== Provider.CREDENTIALS) {
      return NextResponse.json(
        {
          message: t('validation.invalid_provider'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (session.user.totp) {
      return NextResponse.json(
        {
          message: t('validation.two_factor_already_enabled'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Additional rate limiting per user to prevent setup spam
    const userKey = `two-factor-setup:user:${session.user.id}`;
    const isUserLimited = await isRateLimited(userKey, 5, 300); // 5 requests per 5 minutes per user

    if (isUserLimited) {
      logger.warn('User-based rate limit exceeded for 2FA setup', {
        userId: session.user.id,
      });
      return NextResponse.json(
        {
          message: t('validation.too_many_requests'),
        },
        { status: HttpStatus.TOO_MANY_REQUESTS },
      );
    }

    // Verify password before revealing the secret
    const { password } = validated.data;
    const passwordMatch = verifyPassword(password, session.user.passwordHash!);

    if (!passwordMatch) {
      logger.warn('Failed 2FA setup attempt - incorrect password', {
        userId: session.user.id,
      });
      return NextResponse.json(
        {
          message: t('validation.wrong_password'),
          field: 'password',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Generate a cryptographically secure secret
    const secret = generateTOTPSecret();
    const qrCodeUri = createTOTPUri(secret, session.user.email);

    // Validate that the QR code URI and secret were properly generated
    if (!secret || !qrCodeUri || secret.length < 16) {
      logger.error('Failed to generate valid 2FA setup data', {
        userId: session.user.id,
        secretLength: secret?.length || 0,
      });
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }

    // Store the encrypted secret in Redis with a 5-minute TTL
    // so the enable endpoint can retrieve it server-side
    const redisKey = `totp-setup:${session.user.id}`;
    const encryptedSecret = encryptTOTPSecret(secret);
    await redisClient.set(redisKey, encryptedSecret, 'EX', 300);

    logger.info('Two-factor setup initiated', {
      userId: session.user.id,
      email: session.user.email,
      ip: ip || 'unknown',
    });

    return NextResponse.json({
      secret,
      qrCodeUri,
    });
  } catch (error) {
    logger.error("Error occurred in 'two-factor/setup' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
