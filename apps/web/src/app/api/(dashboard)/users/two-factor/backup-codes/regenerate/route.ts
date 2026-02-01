import { isRateLimited } from '@/lib/security/rate-limiter';
import { getSession } from '@/lib/security/session';
import { getIp, getLanguage } from '@/lib/utils/header-helpers';
import {
  RegenerateBackupCodesSchema,
  regenerateBackupCodesSchema,
} from '@/lib/validation/two-factor/regenerate-backup-codes-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  decryptTOTPSecret,
  findAndVerifyBackupCode,
  generateBackupCodes,
  hashBackupCodes,
  logger,
  prisma,
  Provider,
  verifyPassword,
  verifyTOTPCode,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export interface IRegenerateBackupCodesSuccessResponse {
  backupCodes: string[];
}

export type IRegenerateBackupCodesResponse =
  | ErrorResponse
  | IRegenerateBackupCodesSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IRegenerateBackupCodesResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as RegenerateBackupCodesSchema;
    const validated = await regenerateBackupCodesSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Rate limiting for regenerate backup codes
    const ip = await getIp();
    if (ip) {
      const key = `two-factor-regenerate-backup:${ip}`;
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

    const { password, totpCode } = validated.data;

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
          recoveryCodes: {
            omit: {
              code: false,
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

    // Ensure TOTP is enabled and properly configured
    if (!session.user.totp) {
      return NextResponse.json(
        {
          message: t('validation.two_factor_not_enabled'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Additional rate limiting per user to prevent regeneration spam
    const userKey = `two-factor-regenerate-backup:user:${session.user.id}`;
    const isUserLimited = await isRateLimited(userKey, 3, 600); // 3 requests per 10 minutes per user

    if (isUserLimited) {
      logger.warn(
        'User-based rate limit exceeded for backup code regeneration',
        {
          userId: session.user.id,
        },
      );
      return NextResponse.json(
        {
          message: t('validation.too_many_requests'),
        },
        { status: HttpStatus.TOO_MANY_REQUESTS },
      );
    }

    // Validate TOTP secret exists
    if (!session.user.totp.secret) {
      logger.error('TOTP secret is missing for user', {
        userId: session.user.id,
      });
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }

    // Verify password
    const passwordMatch = verifyPassword(password, session.user.passwordHash!);

    if (!passwordMatch) {
      return NextResponse.json(
        {
          message: t('validation.wrong_password'),
          field: 'password',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // Decrypt and verify TOTP code
    let decryptedSecret: string;
    try {
      decryptedSecret = decryptTOTPSecret(session.user.totp.secret);
    } catch (error) {
      logger.error('Failed to decrypt TOTP secret', {
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

    // Verify TOTP code or backup code
    let isValidCode = false;
    let usedBackupCodeId: string | null = null;

    // Check if it's a 6-digit TOTP code or an 8-char backup code
    if (totpCode.length === 6 && /^\d{6}$/.test(totpCode)) {
      const result = verifyTOTPCode(
        decryptedSecret,
        totpCode,
        session.user.totp.lastUsedAt,
      );
      isValidCode = result.valid;
    } else if (totpCode.length === 8 && /^[A-Z0-9]{8}$/i.test(totpCode)) {
      // It's a backup code - verify against existing codes
      const activeRecoveryCodes = session.user.recoveryCodes.filter(
        (rc) => !rc.used,
      );

      if (activeRecoveryCodes.length === 0) {
        logger.warn('No backup codes available for regeneration verification', {
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
      logger.warn('Failed backup code regeneration attempt - invalid code', {
        userId: session.user.id,
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

    // Generate new backup codes
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = hashBackupCodes(backupCodes);

    // Use transaction to ensure atomicity of all operations
    try {
      await prisma.$transaction(async (tx) => {
        // Mark the used backup code if applicable
        if (usedBackupCodeId) {
          await tx.userRecoveryCode.update({
            where: { id: usedBackupCodeId },
            data: {
              used: true,
              usedAt: new Date(),
            },
          });
        }

        // Delete all existing recovery codes
        await tx.userRecoveryCode.deleteMany({
          where: {
            userId: session.user.id,
          },
        });

        // Create new recovery codes
        await tx.userRecoveryCode.createMany({
          data: hashedBackupCodes.map((code) => ({
            userId: session.user.id,
            code,
          })),
        });
      });

      logger.info('Backup codes regenerated successfully', {
        userId: session.user.id,
        usedBackupCode: usedBackupCodeId !== null,
        ip: ip || 'unknown',
      });

      return NextResponse.json({
        backupCodes,
      });
    } catch (dbError) {
      logger.error('Database error while regenerating backup codes', {
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
    logger.error(
      "Error occurred in 'two-factor/backup-codes/regenerate' route:",
      error,
    );
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
