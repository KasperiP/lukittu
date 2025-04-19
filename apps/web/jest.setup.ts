import { PrismaClient } from '@lukittu/shared';
import '@testing-library/jest-dom';
import { mockDeep, mockReset } from 'jest-mock-extended';

export const prismaMock = mockDeep<PrismaClient>();

jest.mock('@lukittu/shared', () => ({
  __esModule: true,
  prisma: prismaMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
});
