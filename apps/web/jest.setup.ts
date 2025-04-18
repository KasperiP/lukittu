import { PrismaClient } from '@lukittu/prisma';
import '@testing-library/jest-dom';
import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';
import { prisma } from '@lukittu/prisma';

jest.mock('@lukittu/prisma', () => ({
  __esModule: true,
  default: mockDeep<PrismaClient>(),
}));

beforeEach(() => {
  mockReset(prismaMock);
});

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
