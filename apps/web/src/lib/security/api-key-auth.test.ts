import { headers } from 'next/headers';
import { prismaMock } from '../../../jest.setup';
import { verifyApiAuthorization } from './api-key-auth';

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

describe('verifyApiAuthorization', () => {
  const teamId = '123e4567-e89b-42d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
    (headers as jest.Mock).mockResolvedValue(
      new Map([['authorization', 'Bearer test-key']]),
    );
  });

  test('only matches keys that have no expiry or have not expired', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });

    try {
      prismaMock.team.findUnique.mockResolvedValue(null);

      await verifyApiAuthorization(teamId);

      const query = prismaMock.team.findUnique.mock.calls[0][0] as {
        include: { apiKeys: { where: unknown } };
      };

      expect(query.include.apiKeys.where).toEqual({
        key: expect.any(String),
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date('2026-01-01T00:00:00.000Z') } },
        ],
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('rejects when no usable key matches', async () => {
    prismaMock.team.findUnique.mockResolvedValue({
      id: teamId,
      apiKeys: [],
      limits: {},
      settings: {},
    } as any);

    await expect(verifyApiAuthorization(teamId)).resolves.toEqual({
      team: null,
    });
  });

  test('accepts when a usable key matches', async () => {
    const team = {
      id: teamId,
      apiKeys: [{ id: 'key-1' }],
      limits: {},
      settings: {},
    };
    prismaMock.team.findUnique.mockResolvedValue(team as any);

    await expect(verifyApiAuthorization(teamId)).resolves.toEqual({ team });
  });
});
