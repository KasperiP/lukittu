import crypto from 'crypto';
import 'server-only';
import { logger } from '../logging/logger';

const ENCRYPTION_KEY =
  process.env.NODE_ENV === 'test'
    ? 'test-encryption-key'.padEnd(32, '0')
    : process.env.ENCRYPTION_KEY!;

const HMAC_KEY =
  process.env.NODE_ENV === 'test' ? 'test-hmac-key' : process.env.HMAC_KEY!;

const IV_LENGTH = 16;

export function hashPassword(password: string) {
  const iterations = 100000;
  const keyLength = 64;
  const digest = 'sha512';

  try {
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(
      password,
      salt,
      iterations,
      keyLength,
      digest,
    );
    return `${iterations}:${keyLength}:${salt.toString('hex')}:${hash.toString('hex')}`;
  } catch (error) {
    logger.error('Error occurred in hashPassword:', error);
    throw new Error('Hashing failed');
  }
}

export function verifyPassword(password: string, storedHash: string) {
  try {
    const [iterations, keyLength, saltHex, originalHash] =
      storedHash.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const verifyHash = crypto
      .pbkdf2Sync(
        password,
        salt,
        parseInt(iterations, 10),
        parseInt(keyLength, 10),
        'sha512',
      )
      .toString('hex');
    return verifyHash === originalHash;
  } catch (error) {
    logger.error('Error occurred in verifyPassword:', error);
    throw new Error('Verification failed');
  }
}

export function encryptLicenseKey(licenseKey: string): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(ENCRYPTION_KEY),
      iv,
    );

    let encrypted = cipher.update(licenseKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
  } catch (error) {
    logger.error('Error occurred in encryptLicenseKey:', error);
    throw new Error('Encryption failed');
  }
}

export function decryptLicenseKey(encryptedString: string): string {
  try {
    const [ivHex, encryptedData, authTagHex] = encryptedString.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(ENCRYPTION_KEY),
      iv,
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    logger.error('Error occurred in decryptLicenseKey:', error);
    throw new Error('Decryption failed');
  }
}
export function generateHMAC(licenseKey: string): string {
  try {
    return crypto
      .createHmac('sha256', HMAC_KEY)
      .update(licenseKey)
      .digest('hex');
  } catch (error) {
    logger.error('Error occurred in generateHMAC:', error);
    throw new Error('HMAC generation failed');
  }
}

export function generateKeyPair() {
  try {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });
  } catch (error) {
    logger.error('Error occurred in generateKeyPair:', error);
    throw new Error('Key pair generation failed');
  }
}

export function signChallenge(challenge: string, privateKey: string) {
  try {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(challenge);
    return sign.sign(privateKey, 'hex');
  } catch (error) {
    logger.error('Error occurred in signChallenge:', error);
    throw new Error('Signing failed');
  }
}

export async function generateMD5Hash(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = file.stream();
    const reader = stream.getReader();

    async function processStream() {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            hash.end();
            const hashHex = hash.digest('hex');
            resolve(hashHex);
            return;
          }

          hash.update(value);
        }
      } catch (error) {
        reader.releaseLock();
        reject(error);
      } finally {
        reader.releaseLock();
      }
    }

    processStream().catch(reject);
  });
}

export async function privateDecrypt(
  encryptedData: string,
  privateKey: string,
) {
  try {
    const privateKeyBuffer = crypto.createPrivateKey({
      key: privateKey,
      format: 'pem',
      type: 'pkcs8',
    });
    return crypto.privateDecrypt(
      {
        key: privateKeyBuffer,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      },
      Buffer.from(encryptedData, 'hex'),
    );
  } catch (error) {
    logger.error('Error occurred in privateDecrypt:', error);
    throw new Error('Decryption failed');
  }
}

export function encryptChunk(chunk: Buffer, sessionKey: string) {
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM

  // Hash the session key consistently
  const sessionKeyHash = crypto
    .createHash('sha256')
    .update(sessionKey)
    .digest();

  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKeyHash, iv);

  const encryptedChunk = Buffer.concat([cipher.update(chunk), cipher.final()]);

  const authTag = cipher.getAuthTag(); // 16-byte authentication tag

  return { encryptedChunk, iv, authTag };
}

export function createEncryptionStream(sessionKey: string) {
  return new TransformStream({
    transform: async (chunk: Buffer, controller) => {
      const { authTag, encryptedChunk, iv } = encryptChunk(chunk, sessionKey);

      // Combine in specific order: IV + Auth Tag + Encrypted Data
      const length = Buffer.alloc(4);
      const encryptedData = Buffer.concat([iv, authTag, encryptedChunk]);
      length.writeUInt32BE(encryptedData.length);

      controller.enqueue(Buffer.concat([length, encryptedData]));
    },
  });
}
