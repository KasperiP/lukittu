import { cookies } from 'next/headers';
import { getCloudflareVisitorData } from '../providers/cloudflare';
import { getIp, getUserAgent } from '../utils/header-helpers';
import { createSession, getSession } from './session';
import { prismaMock } from '../../../jest.setup';

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('../providers/cloudflare', () => ({
  getCloudflareVisitorData: jest.fn(),
}));

jest.mock('../utils/header-helpers', () => ({
  getIp: jest.fn(),
  getUserAgent: jest.fn(),
}));

describe('Session Management', () => {
  const mockCookieStore = {
    set: jest.fn(),
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (cookies as jest.Mock).mockReturnValue(mockCookieStore);
    (getIp as jest.Mock).mockResolvedValue('127.0.0.1');
    (getUserAgent as jest.Mock).mockResolvedValue('test-agent');
    (getCloudflareVisitorData as jest.Mock).mockResolvedValue({ alpha2: 'US' });
  });

  describe('createSession', () => {
    it('should create a session successfully', async () => {
      const mockSession = {
        id: 1,
        sessionId: expect.any(String),
        userId: 'test-user',
        expiresAt: expect.any(Date),
        ipAddress: '127.0.0.1',
        country: 'USA',
        userAgent: 'test-agent',
      };

      (prismaMock.session.create as jest.Mock).mockResolvedValue(mockSession);

      const result = await createSession('test-user', false);

      expect(result).toEqual(mockSession);
      expect(prismaMock.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'test-user',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
        }),
      });
      expect(mockCookieStore.set).toHaveBeenCalled();
    });

    it('should handle errors and return null', async () => {
      (prismaMock.session.create as jest.Mock).mockRejectedValue(
        new Error('DB Error'),
      );

      const result = await createSession('test-user', false);

      expect(result).toBeNull();
    });
  });

  describe('getSession', () => {
    it('should return null if no session cookie exists', async () => {
      mockCookieStore.get.mockReturnValue(undefined);

      const result = await getSession();

      expect(result).toBeNull();
      expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
    });

    it('should return session if valid', async () => {
      const mockSession = {
        id: 1,
        sessionId: 'test-session',
        userId: 'test-user',
        expiresAt: new Date(),
      };

      mockCookieStore.get.mockReturnValue({ value: 'test-session' });
      (prismaMock.session.findUnique as jest.Mock).mockResolvedValue(
        mockSession,
      );

      const result = await getSession();

      expect(result).toEqual({
        ...mockSession,
        sessionId: 'test-session',
      });
      expect(prismaMock.session.findUnique).toHaveBeenCalledWith({
        where: {
          sessionId: 'test-session',
          expiresAt: {
            gte: expect.any(Date),
          },
        },
        include: null,
      });
    });
  });
});
