import { isRateLimited } from '@/lib/security/rate-limiter';
import { getSession } from '@/lib/security/session';
import { getIp, getLanguage } from '@/lib/utils/header-helpers';
import {
  EnableTwoFactorSchema,
  enableTwoFactorSchema,
} from '@/lib/validation/two-factor/enable-two-factor-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  decryptTOTPSecret,
  generateBackupCodes,
  hashBackupCodes,
  logger,
  prisma,
  Provider,
  redisClient,
  verifyPassword,
  verifyTOTPCode,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export interface ITwoFactorEnableSuccessResponse {
  success: boolean;
  backupCodes: string[];
}

export type ITwoFactorEnableResponse =
  | ErrorResponse
  | ITwoFactorEnableSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ITwoFactorEnableResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as EnableTwoFactorSchema;
    const validated = await enableTwoFactorSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Rate limiting for two-factor enable - both IP and user-based
    const ip = await getIp();
    if (ip) {
      const key = `two-factor-enable:${ip}`;
      const isLimited = await isRateLimited(key, 5, 300); // 5 requests per 5 minutes

      if (isLimited) {
        return NextResponse.json(
          {
            message: t('validation.too_many_requests'),
          },
          { status: HttpStatus.TOO_MANY_REQUESTS },
        );
      }
    }

    const { totpCode, password } = validated.data;

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

    // Additional rate limiting per user to prevent account-specific abuse
    const userKey = `two-factor-enable:user:${session.user.id}`;
    const isUserLimited = await isRateLimited(userKey, 3, 600); // 3 requests per 10 minutes per user

    if (isUserLimited) {
      logger.warn('User-based rate limit exceeded for 2FA enable', {
        userId: session.user.id,
      });
      return NextResponse.json(
        {
          message: t('validation.too_many_requests'),
        },
        { status: HttpStatus.TOO_MANY_REQUESTS },
      );
    }

    // Retrieve the TOTP secret from Redis (stored during setup)
    const redisKey = `totp-setup:${session.user.id}`;
    const encryptedSecret = await redisClient.get(redisKey);

    if (!encryptedSecret) {
      logger.warn('No pending TOTP setup found for user', {
        userId: session.user.id,
      });
      return NextResponse.json(
        {
          message: t('validation.two_factor_setup_expired'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Decrypt the secret to verify the TOTP code
    let secret: string;
    try {
      secret = decryptTOTPSecret(encryptedSecret);
    } catch (error) {
      logger.error('Failed to decrypt pending TOTP secret', {
        userId: session.user.id,
        error,
      });
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }

    // Verify password first
    const passwordMatch = verifyPassword(password, session.user.passwordHash!);

    if (!passwordMatch) {
      logger.warn('Failed 2FA enable attempt - incorrect password', {
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

    // Verify TOTP code
    const { valid: isValidCode } = verifyTOTPCode(secret, totpCode);

    if (!isValidCode) {
      logger.warn('Failed 2FA enable attempt - invalid TOTP code', {
        userId: session.user.id,
      });
      return NextResponse.json(
        {
          message: t('validation.two_factor_code_invalid'),
          field: 'totpCode',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = hashBackupCodes(backupCodes);

    // Use transaction to ensure atomicity of all operations
    try {
      await prisma.$transaction(async (tx) => {
        // Delete any existing 2FA configuration (cleanup)
        await tx.userTOTP.deleteMany({
          where: { userId: session.user.id },
        });
        await tx.userRecoveryCode.deleteMany({
          where: { userId: session.user.id },
        });

        // Create new TOTP configuration
        await tx.userTOTP.create({
          data: {
            userId: session.user.id,
            secret: encryptedSecret,
          },
        });

        // Create recovery codes
        await tx.userRecoveryCode.createMany({
          data: hashedBackupCodes.map((code) => ({
            userId: session.user.id,
            code,
          })),
        });
      });

      // Clean up the pending secret from Redis
      await redisClient.del(redisKey);

      logger.info('Two-factor authentication enabled successfully', {
        userId: session.user.id,
        ip: ip || 'unknown',
      });

      return NextResponse.json({
        success: true,
        backupCodes,
      });
    } catch (dbError) {
      logger.error('Database error while enabling 2FA', {
        userId: session.user.id,
        error: dbError,
      });
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }
  } catch (error) {
    logger.error("Error occurred in 'two-factor/enable' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
