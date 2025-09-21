import { PrismaClient } from '@lukittu/shared';
import '@testing-library/jest-dom';
import { mockDeep, mockReset } from 'jest-mock-extended';

export const prismaMock = mockDeep<PrismaClient>();

jest.mock('@lukittu/shared', () => ({
  __esModule: true,
  ...jest.requireActual('@lukittu/shared'),
  prisma: prismaMock,
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
  encryptString: jest.fn(),
  decryptString: jest.fn(),
  generateUniqueLicense: jest.fn(),
  generateHMAC: jest.fn(),
  createLicensePayload: jest.fn(),
  createWebhookEvents: jest.fn().mockResolvedValue([]),
  createCustomerPayload: jest.fn(),
  updateCustomerPayload: jest.fn(),
  attemptWebhookDelivery: jest.fn(),
}));

beforeEach(() => {
  mockReset(prismaMock);
});
