import crypto from 'crypto';
import { logger } from '../logging/logger';
import {
  decryptLicenseKey,
  encryptLicenseKey,
  generateHMAC,
  generateKeyPair,
  hashPassword,
  signChallenge,
  verifyPassword,
} from './crypto';

jest.mock('crypto', () => ({
  randomBytes: jest.fn(),
  pbkdf2Sync: jest.fn(),
  createCipheriv: jest.fn(),
  createDecipheriv: jest.fn(),
  createHmac: jest.fn(),
  generateKeyPairSync: jest.fn(),
  createSign: jest.fn(),
}));

jest.mock('../logging/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('Cryptographic Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENCRYPTION_KEY = 'test-encryption-key'.padEnd(32, '0');
    process.env.HMAC_KEY = 'test-hmac-key';
  });

  describe('hashPassword', () => {
    it('should generate a valid password hash', () => {
      const mockSalt = Buffer.from('0123456789abcdef');
      const mockHash = Buffer.from('hashedpassword'.repeat(4));
      (crypto.randomBytes as jest.Mock).mockReturnValue(mockSalt);
      (crypto.pbkdf2Sync as jest.Mock).mockReturnValue(mockHash);

      const result = hashPassword('testpassword');

      expect(result).toMatch(/^100000:64:[a-f0-9]+:[a-f0-9]+$/);
      expect(crypto.pbkdf2Sync).toHaveBeenCalledWith(
        'testpassword',
        mockSalt,
        100000,
        64,
        'sha512',
      );
    });

    it('should throw error on crypto failure', () => {
      (crypto.randomBytes as jest.Mock).mockImplementation(() => {
        throw new Error('Crypto error');
      });

      expect(() => hashPassword('testpassword')).toThrow('Hashing failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Error occurred in hashPassword:',
        expect.any(Error),
      );
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', () => {
      const mockHash = Buffer.from('hashedpassword'.repeat(4));
      (crypto.pbkdf2Sync as jest.Mock).mockReturnValue(mockHash);
      const storedHash = '100000:64:salt:' + mockHash.toString('hex');

      const result = verifyPassword('testpassword', storedHash);

      expect(result).toBe(true);
    });

    it('should reject incorrect password', () => {
      const mockHash1 = Buffer.from('hash1');
      const mockHash2 = Buffer.from('hash2');
      (crypto.pbkdf2Sync as jest.Mock).mockReturnValueOnce(mockHash1);
      const storedHash = '100000:64:salt:' + mockHash2.toString('hex');

      const result = verifyPassword('wrongpassword', storedHash);

      expect(result).toBe(false);
    });

    it('should throw error on invalid stored hash format', () => {
      expect(() => verifyPassword('testpassword', 'invalid:hash')).toThrow(
        'Verification failed',
      );
    });
  });

  describe('encryptLicenseKey', () => {
    let mockCipher: any;

    beforeEach(() => {
      mockCipher = {
        update: jest
          .fn()
          .mockReturnValue(Buffer.from('encrypted').toString('hex')),
        final: jest.fn().mockReturnValue(Buffer.from('final').toString('hex')),
        getAuthTag: jest.fn().mockReturnValue(Buffer.from('authtag')),
      };
      (crypto.createCipheriv as jest.Mock).mockReturnValue(mockCipher);
      (crypto.randomBytes as jest.Mock).mockReturnValue(Buffer.from('iv'));
    });

    it('should encrypt license key', () => {
      const result = encryptLicenseKey('test-license');

      expect(result).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);
      expect(crypto.createCipheriv).toHaveBeenCalledWith(
        'aes-256-gcm',
        expect.any(Buffer),
        expect.any(Buffer),
      );
    });

    it('should throw error on encryption failure', () => {
      (crypto.createCipheriv as jest.Mock).mockImplementation(() => {
        throw new Error('Encryption error');
      });

      expect(() => encryptLicenseKey('test-license')).toThrow(
        'Encryption failed',
      );
    });
  });

  describe('decryptLicenseKey', () => {
    let mockDecipher: any;

    beforeEach(() => {
      mockDecipher = {
        update: jest.fn().mockReturnValue('decrypted'),
        final: jest.fn().mockReturnValue('final'),
        setAuthTag: jest.fn(),
      };
      (crypto.createDecipheriv as jest.Mock).mockReturnValue(mockDecipher);
    });

    it('should decrypt license key', () => {
      const encryptedString = 'iv:encrypted:authtag';

      const result = decryptLicenseKey(encryptedString);

      expect(result).toBe('decryptedfinal');
      expect(mockDecipher.setAuthTag).toHaveBeenCalled();
    });

    it('should throw error on decryption failure', () => {
      (crypto.createDecipheriv as jest.Mock).mockImplementation(() => {
        throw new Error('Decryption error');
      });

      expect(() => decryptLicenseKey('iv:encrypted:authtag')).toThrow(
        'Decryption failed',
      );
    });
  });

  describe('generateHMAC', () => {
    let mockHmac: any;

    beforeEach(() => {
      mockHmac = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('hmac'),
      };
      (crypto.createHmac as jest.Mock).mockReturnValue(mockHmac);
    });

    it('should generate HMAC', () => {
      const result = generateHMAC('test-license');

      expect(result).toBe('hmac');
      expect(crypto.createHmac).toHaveBeenCalledWith(
        'sha256',
        expect.any(String),
      );
    });

    it('should throw error on HMAC generation failure', () => {
      (crypto.createHmac as jest.Mock).mockImplementation(() => {
        throw new Error('HMAC error');
      });

      expect(() => generateHMAC('test-license')).toThrow(
        'HMAC generation failed',
      );
    });
  });

  describe('generateKeyPair', () => {
    it('should generate RSA key pair', () => {
      const mockKeyPair = {
        publicKey: 'public-key',
        privateKey: 'private-key',
      };
      (crypto.generateKeyPairSync as jest.Mock).mockReturnValue(mockKeyPair);

      const result = generateKeyPair();

      expect(result).toEqual(mockKeyPair);
      expect(crypto.generateKeyPairSync).toHaveBeenCalledWith('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: expect.any(Object),
        privateKeyEncoding: expect.any(Object),
      });
    });

    it('should throw error on key pair generation failure', () => {
      (crypto.generateKeyPairSync as jest.Mock).mockImplementation(() => {
        throw new Error('Key pair error');
      });

      expect(() => generateKeyPair()).toThrow('Key pair generation failed');
    });
  });

  describe('signChallenge', () => {
    let mockSign: any;

    beforeEach(() => {
      mockSign = {
        update: jest.fn().mockReturnThis(),
        sign: jest.fn().mockReturnValue('signature'),
      };
      (crypto.createSign as jest.Mock).mockReturnValue(mockSign);
    });

    it('should sign challenge', () => {
      const result = signChallenge('test-challenge', 'private-key');

      expect(result).toBe('signature');
      expect(crypto.createSign).toHaveBeenCalledWith('RSA-SHA256');
      expect(mockSign.update).toHaveBeenCalledWith('test-challenge');
    });

    it('should throw error on signing failure', () => {
      (crypto.createSign as jest.Mock).mockImplementation(() => {
        throw new Error('Signing error');
      });

      expect(() => signChallenge('test-challenge', 'private-key')).toThrow(
        'Signing failed',
      );
    });
  });
});
