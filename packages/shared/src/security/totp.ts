import crypto from 'crypto';
import * as OTPAuth from 'otpauth';
import { logger } from '../logging/logger';
import { decryptString, encryptString } from './crypto';

const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_COUNT = 10;
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH = 32;
const ISSUER = 'Lukittu';

export function generateTOTPSecret(): string {
  try {
    const secret = new OTPAuth.Secret({ size: 20 });
    return secret.base32;
  } catch (error) {
    logger.error('Error occurred in generateTOTPSecret:', error);
    throw new Error('Failed to generate TOTP secret');
  }
}

export function createTOTPUri(secret: string, email: string): string {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    return totp.toString();
  } catch (error) {
    logger.error('Error occurred in createTOTPUri:', error);
    throw new Error('Failed to create TOTP URI');
  }
}

export function verifyTOTPCode(
  secret: string,
  code: string,
): { valid: boolean } {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const delta = totp.validate({ token: code, window: 1 });

    return { valid: delta !== null };
  } catch (error) {
    logger.error('Error occurred in verifyTOTPCode:', error);
    return { valid: false };
  }
}

export function generateBackupCodes(
  count: number = BACKUP_CODE_COUNT,
): string[] {
  try {
    const codes: string[] = [];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
        code += chars[crypto.randomInt(0, chars.length)];
      }
      codes.push(code);
    }

    return codes;
  } catch (error) {
    logger.error('Error occurred in generateBackupCodes:', error);
    throw new Error('Failed to generate backup codes');
  }
}

export function hashBackupCode(code: string): string {
  try {
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(
      code.toUpperCase(),
      salt,
      PBKDF2_ITERATIONS,
      PBKDF2_KEY_LENGTH,
      'sha256',
    );
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
  } catch (error) {
    logger.error('Error occurred in hashBackupCode:', error);
    throw new Error('Failed to hash backup code');
  }
}

export function verifyBackupCode(code: string, hashedCode: string): boolean {
  try {
    const [saltHex, originalHash] = hashedCode.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const verifyHash = crypto.pbkdf2Sync(
      code.toUpperCase(),
      salt,
      PBKDF2_ITERATIONS,
      PBKDF2_KEY_LENGTH,
      'sha256',
    );
    return crypto.timingSafeEqual(Buffer.from(originalHash, 'hex'), verifyHash);
  } catch (error) {
    logger.error('Error occurred in verifyBackupCode:', error);
    return false;
  }
}

export function encryptTOTPSecret(secret: string): string {
  return encryptString(secret);
}

export function decryptTOTPSecret(encrypted: string): string {
  return decryptString(encrypted);
}

export function hashBackupCodes(codes: string[]): string[] {
  return codes.map(hashBackupCode);
}

export function findAndVerifyBackupCode(
  code: string,
  hashedCodes: string[],
): number {
  for (let i = 0; i < hashedCodes.length; i++) {
    if (verifyBackupCode(code, hashedCodes[i])) {
      return i;
    }
  }
  return -1;
}
