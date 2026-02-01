import { isRateLimited } from '@/lib/security/rate-limiter';
import { createSession } from '@/lib/security/session';
import { getIp, getLanguage } from '@/lib/utils/header-helpers';
import {
  VerifyTwoFactorSchema,
  verifyTwoFactorSchema,
} from '@/lib/validation/two-factor/verify-two-factor-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { JwtTypes } from '@/types/jwt-types-enum';
import {
  decryptTOTPSecret,
  findAndVerifyBackupCode,
  logger,
  prisma,
  verifyTOTPCode,
} from '@lukittu/shared';
import jwt from 'jsonwebtoken';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

interface TwoFactorJwtPayload {
  userId: string;
  type: JwtTypes;
}

export interface ITwoFactorVerifySuccessResponse {
  success: boolean;
}

export type ITwoFactorVerifyResponse =
  | ErrorResponse
  | ITwoFactorVerifySuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ITwoFactorVerifyResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as VerifyTwoFactorSchema;
    const validated = await verifyTwoFactorSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const ip = await getIp();

    if (ip) {
      const key = `two-factor-verify:${ip}`;
      const isLimited = await isRateLimited(key, 5, 300); // Tighter: 5 attempts per 5 minutes

      if (isLimited) {
        logger.warn('IP-based rate limit exceeded for 2FA verify', {
          ip,
        });
        return NextResponse.json(
          {
            message: t('validation.too_many_requests'),
          },
          { status: HttpStatus.TOO_MANY_REQUESTS },
        );
      }
    }

    const { twoFactorToken, totpCode, rememberMe } = validated.data;

    let decoded: TwoFactorJwtPayload;

    try {
      decoded = jwt.verify(
        twoFactorToken,
        process.env.JWT_SECRET!,
      ) as TwoFactorJwtPayload;
    } catch (error) {
      const errorType =
        error instanceof jwt.TokenExpiredError
          ? 'expired'
          : error instanceof jwt.JsonWebTokenError
            ? 'invalid'
            : 'unknown';

      logger.warn('Invalid 2FA token provided', {
        errorType,
        ip,
      });

      return NextResponse.json(
        {
          message:
            errorType === 'expired'
              ? t('validation.two_factor_token_expired')
              : t('validation.invalid_token'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (decoded.type !== JwtTypes.TWO_FACTOR_VERIFICATION) {
      logger.warn('Invalid JWT type for 2FA verify', {
        receivedType: decoded.type,
        ip,
      });
      return NextResponse.json(
        {
          message: t('validation.invalid_token'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Add per-user rate limiting after JWT is verified
    const userKey = `two-factor-verify:user:${decoded.userId}`;
    const isUserLimited = await isRateLimited(userKey, 3, 300); // 3 attempts per 5 minutes per user

    if (isUserLimited) {
      logger.warn('User-based rate limit exceeded for 2FA verify', {
        userId: decoded.userId,
      });
      return NextResponse.json(
        {
          message: t('validation.too_many_requests'),
        },
        { status: HttpStatus.TOO_MANY_REQUESTS },
      );
    }

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.userId,
      },
      include: {
        totp: {
          omit: {
            secret: false,
          },
        },
        recoveryCodes: {
          omit: {
            code: false,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          message: t('validation.user_not_found'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (!user.totp) {
      return NextResponse.json(
        {
          message: t('validation.two_factor_not_enabled'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Validate TOTP secret exists
    if (!user.totp.secret) {
      logger.error('TOTP secret is missing for user during verification', {
        userId: user.id,
      });
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }

    // Decrypt TOTP secret
    let decryptedSecret: string;
    try {
      decryptedSecret = decryptTOTPSecret(user.totp.secret);
    } catch (error) {
      logger.error('Failed to decrypt TOTP secret during verification', {
        userId: user.id,
        error,
      });
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }

    let isValidCode = false;
    let usedBackupCodeId: string | null = null;
    let totpVerifiedAt: Date | null = null;

    // Check if it's a 6-digit TOTP code or an 8-char backup code
    if (totpCode.length === 6 && /^\d{6}$/.test(totpCode)) {
      const result = verifyTOTPCode(
        decryptedSecret,
        totpCode,
        user.totp.lastUsedAt,
      );
      isValidCode = result.valid;
      totpVerifiedAt = result.timestamp;
    } else if (totpCode.length === 8 && /^[A-Z0-9]{8}$/i.test(totpCode)) {
      const activeRecoveryCodes = user.recoveryCodes.filter((rc) => !rc.used);
      const hashedBackupCodes = activeRecoveryCodes.map((rc) => rc.code);

      const backupCodeIndex = findAndVerifyBackupCode(
        totpCode,
        hashedBackupCodes,
      );

      if (backupCodeIndex !== -1) {
        isValidCode = true;
        usedBackupCodeId = activeRecoveryCodes[backupCodeIndex].id;
      }
    }

    if (!isValidCode) {
      logger.warn('Failed 2FA verification attempt - invalid code', {
        userId: user.id,
        codeType: totpCode.length === 6 ? 'totp' : 'backup',
      });
      return NextResponse.json(
        {
          message: t('validation.two_factor_code_invalid'),
          field: 'totpCode',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Update database state atomically, then create session
    try {
      await prisma.$transaction(async (tx) => {
        if (usedBackupCodeId) {
          await tx.userRecoveryCode.update({
            where: { id: usedBackupCodeId },
            data: {
              used: true,
              usedAt: new Date(),
            },
          });
        }

        if (totpVerifiedAt) {
          await tx.userTOTP.update({
            where: { userId: user.id },
            data: { lastUsedAt: totpVerifiedAt },
          });
        }
      });

      const session = await createSession(user.id, rememberMe);

      if (!session) {
        // Compensate: if a backup code was marked used but session creation failed,
        // revert the backup code so the user doesn't lose it without authentication
        if (usedBackupCodeId) {
          await prisma.userRecoveryCode.update({
            where: { id: usedBackupCodeId },
            data: { used: false, usedAt: null },
          });
        }
        logger.error('Failed to create session after 2FA verification', {
          userId: user.id,
        });
        return NextResponse.json(
          {
            message: t('general.server_error'),
          },
          { status: HttpStatus.INTERNAL_SERVER_ERROR },
        );
      }

      logger.info('Two-factor verification successful', {
        userId: user.id,
        usedBackupCode: usedBackupCodeId !== null,
        rememberMe,
        ip: ip || 'unknown',
      });

      return NextResponse.json({
        success: true,
      });
    } catch (error) {
      logger.error('Error during 2FA verification final steps', {
        userId: user.id,
        error,
      });
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }
  } catch (error) {
    logger.error("Error occurred in 'auth/two-factor/verify' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
