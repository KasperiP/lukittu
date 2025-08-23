import { HttpStatus } from '@/types/http-status';
import {
  BuiltByBitIntegration,
  decryptLicenseKey,
  encryptLicenseKey,
  generateHMAC,
  generateUniqueLicense,
  Limits,
  logger,
  prisma,
  Settings,
  Team,
} from '@lukittu/shared';
import { prismaMock } from '../../../jest.setup';
import { createAuditLog } from '../logging/audit-log';
import {
  handleBuiltByBitPlaceholder,
  handleBuiltByBitPurchase,
} from './built-by-bit-external';

jest.mock('../logging/audit-log', () => ({
  createAuditLog: jest.fn().mockResolvedValue({}),
}));

type ExtendedTeam = Team & {
  settings: Settings | null;
  limits: Limits | null;
  builtByBitIntegration: BuiltByBitIntegration | null;
  _count: {
    licenses: number;
    customers: number;
  };
};

describe('BuiltByBit Integration', () => {
  const mockTeam = {
    id: 'team-123',
    name: 'Test Team',
    ownerId: 'owner-123',
    imageUrl: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    settings: {
      id: 'settings-123',
      teamId: 'team-123',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    limits: {
      id: 'limits-123',
      teamId: 'team-123',
      maxLicenses: 100,
      maxCustomers: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    builtByBitIntegration: {
      id: 'bbb-123',
      teamId: 'team-123',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    _count: {
      licenses: 0,
      customers: 0,
    },
  } as ExtendedTeam;

  const mockBuiltByBitData = {
    user: {
      id: '12345',
      username: 'testuser',
      userUrl: 'https://builtbybit.com/user/12345',
    },
    resource: {
      title: 'Test Resource',
      id: '67890',
      url: 'https://builtbybit.com/resource/67890',
      addon: {
        id: '54321',
        title: 'Test Addon',
      },
      bundle: {
        id: '98765',
        title: 'Test Bundle',
      },
      renewal: 'none',
      pricing: {
        listPrice: '19.99',
        finalPrice: '19.99',
      },
      purchaseDate: '1640995200',
    },
  };

  const mockLukittuData = {
    productId: '123e4567-e89b-12d3-a456-426614174000',
    ipLimit: 5,
    hwidLimit: 10,
    expirationDays: 365,
    expirationStart: 'CREATION' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback) => await callback(prismaMock),
    );
    (generateHMAC as jest.Mock).mockReturnValue('test-hmac');
    (generateUniqueLicense as jest.Mock).mockResolvedValue('test-license-key');
    (encryptLicenseKey as jest.Mock).mockReturnValue('encrypted-license-key');
    (decryptLicenseKey as jest.Mock).mockReturnValue('decrypted-license-key');
  });

  describe('handleBuiltByBitPurchase', () => {
    test('successfully processes a new purchase', async () => {
      prismaMock.license.findFirst.mockResolvedValueOnce(null);

      prismaMock.product.findUnique.mockResolvedValueOnce({
        id: mockLukittuData.productId,
        name: 'Test Product',
        teamId: mockTeam.id,
      } as any);

      prismaMock.customer.findFirst.mockResolvedValue(null);
      prismaMock.customer.upsert.mockResolvedValue({
        id: 'cust_123',
        username: 'testuser',
      } as any);

      prismaMock.license.create.mockResolvedValue({
        id: 'license_123',
        licenseKey: 'encrypted-license-key',
        products: [{ name: 'Test Product' }],
      } as any);

      const result = await handleBuiltByBitPurchase(
        'test-request-id',
        mockBuiltByBitData,
        mockLukittuData,
        mockTeam,
      );

      expect(result).toEqual({
        success: true,
        message: 'Purchase processed successfully',
      });
      expect(prismaMock.customer.upsert).toHaveBeenCalled();
      expect(prismaMock.license.create).toHaveBeenCalled();
      expect(generateUniqueLicense).toHaveBeenCalledWith(mockTeam.id);
      expect(logger.info).toHaveBeenCalledWith(
        'handleBuiltByBitPurchase: Built-by-bit purchase processed successfully',
        expect.any(Object),
      );
    });

    test('skips duplicate purchases', async () => {
      prismaMock.license.findFirst.mockResolvedValueOnce({
        id: 'existing_license',
      } as any);

      const result = await handleBuiltByBitPurchase(
        'test-request-id',
        mockBuiltByBitData,
        mockLukittuData,
        mockTeam,
      );

      expect(result).toEqual({
        success: true,
        message: 'Purchase already processed',
      });
      expect(prismaMock.customer.upsert).not.toHaveBeenCalled();
      expect(prismaMock.license.create).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'handleBuiltByBitPurchase: Built-by-bit purchase skipped - already processed',
        expect.any(Object),
      );
    });

    test('handles product not found', async () => {
      prismaMock.license.findFirst.mockResolvedValueOnce(null);

      prismaMock.product.findUnique.mockResolvedValueOnce(null);

      const result = await handleBuiltByBitPurchase(
        'test-request-id',
        mockBuiltByBitData,
        mockLukittuData,
        mockTeam,
      );

      expect(result).toEqual({
        success: false,
        message: 'Product not found',
      });
      expect(prismaMock.customer.upsert).not.toHaveBeenCalled();
      expect(prismaMock.license.create).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'handleBuiltByBitPurchase: Built-by-bit purchase failed - product not found',
        expect.any(Object),
      );
    });

    test('handles license limit reached', async () => {
      const teamWithLicenseLimitReached = {
        ...mockTeam,
        limits: {
          ...mockTeam.limits!,
          maxLicenses: 10,
        },
        _count: {
          licenses: 10,
          customers: 5,
        },
      };

      prismaMock.license.findFirst.mockResolvedValueOnce(null);

      prismaMock.product.findUnique.mockResolvedValueOnce({
        id: mockLukittuData.productId,
        name: 'Test Product',
        teamId: teamWithLicenseLimitReached.id,
      } as any);

      const result = await handleBuiltByBitPurchase(
        'test-request-id',
        mockBuiltByBitData,
        mockLukittuData,
        teamWithLicenseLimitReached as ExtendedTeam,
      );

      expect(result).toEqual({
        success: false,
        message: 'Team has reached the maximum number of licenses',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'handleBuiltByBitPurchase: Built-by-bit purchase failed - license limit reached',
        expect.any(Object),
      );
    });

    test('handles customer limit reached', async () => {
      const teamWithCustomerLimitReached = {
        ...mockTeam,
        limits: {
          ...mockTeam.limits!,
          maxCustomers: 10,
        },
        _count: {
          licenses: 5,
          customers: 10,
        },
      };

      prismaMock.license.findFirst.mockResolvedValueOnce(null);

      prismaMock.product.findUnique.mockResolvedValueOnce({
        id: mockLukittuData.productId,
        name: 'Test Product',
        teamId: teamWithCustomerLimitReached.id,
      } as any);

      const result = await handleBuiltByBitPurchase(
        'test-request-id',
        mockBuiltByBitData,
        mockLukittuData,
        teamWithCustomerLimitReached as ExtendedTeam,
      );

      expect(result).toEqual({
        success: false,
        message: 'Team has reached the maximum number of customers',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'handleBuiltByBitPurchase: Built-by-bit purchase failed - customer limit reached',
        expect.any(Object),
      );
    });

    test('handles license generation failure', async () => {
      prismaMock.license.findFirst.mockResolvedValueOnce(null);
      prismaMock.product.findUnique.mockResolvedValueOnce({
        id: mockLukittuData.productId,
        name: 'Test Product',
        teamId: mockTeam.id,
      } as any);
      prismaMock.customer.findFirst.mockResolvedValue(null);
      prismaMock.customer.upsert.mockResolvedValue({
        id: 'cust_123',
      } as any);

      (generateUniqueLicense as jest.Mock).mockResolvedValue(null);

      const result = await handleBuiltByBitPurchase(
        'test-request-id',
        mockBuiltByBitData,
        mockLukittuData,
        mockTeam,
      );

      expect(result).toEqual({
        success: false,
        message: 'Failed to create a license',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'handleBuiltByBitPurchase: Built-by-bit purchase failed - license key generation failed',
        expect.any(Object),
      );
    });

    test('handles database error', async () => {
      prismaMock.license.findFirst.mockResolvedValueOnce(null);
      prismaMock.product.findUnique.mockResolvedValueOnce({
        id: mockLukittuData.productId,
        name: 'Test Product',
        teamId: mockTeam.id,
      } as any);

      const error = new Error('Database error');
      prismaMock.$transaction.mockRejectedValue(error);

      const result = await handleBuiltByBitPurchase(
        'test-request-id',
        mockBuiltByBitData,
        mockLukittuData,
        mockTeam,
      );

      expect(result).toEqual({
        success: false,
        message: 'An error occurred while processing the purchase',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'handleBuiltByBitPurchase: Built-by-bit purchase processing failed',
        expect.any(Object),
      );
    });
  });

  describe('handleBuiltByBitPlaceholder', () => {
    const mockPlaceholderData = {
      steam_id: '76561198123456789',
      user_id: '12345',
      resource_id: '67890',
      version_id: '54321',
    } as any;

    test('successfully retrieves license key', async () => {
      (prisma.license.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'license_123',
        licenseKey: 'encrypted-license-key',
      });

      // Clear previous mock calls
      (createAuditLog as jest.Mock).mockClear();

      const result = await handleBuiltByBitPlaceholder(
        'test-request-id',
        mockPlaceholderData,
        mockTeam.id,
      );

      expect(result).toEqual({
        success: true,
        licenseKey: 'decrypted-license-key',
      });

      expect(logger.info).toHaveBeenCalledWith(
        'handleBuiltByBitPlaceholder: Built-by-bit placeholder request started',
        expect.any(Object),
      );
      expect(logger.info).toHaveBeenCalledWith(
        'handleBuiltByBitPlaceholder: Built-by-bit placeholder completed',
        expect.any(Object),
      );
      expect(createAuditLog).toHaveBeenCalledTimes(1);
    });

    test('handles license key not found', async () => {
      (prisma.license.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const result = await handleBuiltByBitPlaceholder(
        'test-request-id',
        mockPlaceholderData,
        mockTeam.id,
      );

      expect(result).toEqual({
        status: HttpStatus.NOT_FOUND,
        message: 'License key not found',
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'handleBuiltByBitPlaceholder: License not found',
        expect.any(Object),
      );
    });

    test('handles unexpected errors', async () => {
      const error = new Error('Unexpected error');

      (prisma.license.findFirst as jest.Mock).mockImplementationOnce(() => {
        throw error;
      });

      await expect(
        handleBuiltByBitPlaceholder(
          'test-request-id',
          mockPlaceholderData,
          mockTeam.id,
        ),
      ).rejects.toThrow('Unexpected error');

      expect(logger.error).toHaveBeenCalledWith(
        'handleBuiltByBitPlaceholder: Built-by-bit placeholder processing failed',
        expect.objectContaining({
          error: 'Unexpected error',
          errorType: 'Error',
          requestId: 'test-request-id',
          teamId: mockTeam.id,
        }),
      );
    });
  });
});
