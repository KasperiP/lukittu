import { cookies, headers } from 'next/headers';
import {
  getIp,
  getLanguage,
  getOrigin,
  getSelectedTeam,
  getUserAgent,
} from './header-helpers';

// Mock next/headers
jest.mock('next/headers', () => ({
  headers: jest.fn(),
  cookies: jest.fn(),
}));

describe('Header Helpers', () => {
  // Helper to mock headers
  const mockHeaders = (headerValues: Record<string, string | null>) => {
    (headers as jest.Mock).mockReturnValue({
      get: (key: string) => headerValues[key] || null,
    });
  };

  // Helper to mock cookies
  const mockCookies = (
    cookieValues: Record<string, { value: string } | undefined>,
  ) => {
    (cookies as jest.Mock).mockReturnValue({
      get: (key: string) => cookieValues[key],
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getIp', () => {
    it('should return first IP from x-forwarded-for header', async () => {
      mockHeaders({
        'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        'x-real-ip': '10.0.0.2',
      });

      const result = await getIp();
      expect(result).toBe('192.168.1.1');
    });

    it('should return x-real-ip when x-forwarded-for is not present', async () => {
      mockHeaders({
        'x-forwarded-for': null,
        'x-real-ip': '10.0.0.2',
      });

      const result = await getIp();
      expect(result).toBe('10.0.0.2');
    });

    it('should return null when no IP headers are present', async () => {
      mockHeaders({
        'x-forwarded-for': null,
        'x-real-ip': null,
      });

      const result = await getIp();
      expect(result).toBeNull();
    });
  });

  describe('getOrigin', () => {
    it('should return origin header value', async () => {
      mockHeaders({
        origin: 'https://example.com',
      });

      const result = await getOrigin();
      expect(result).toBe('https://example.com');
    });

    it('should return null when origin header is not present', async () => {
      mockHeaders({
        origin: null,
      });

      const result = await getOrigin();
      expect(result).toBeNull();
    });
  });

  describe('getUserAgent', () => {
    it('should return user-agent header value', async () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
      mockHeaders({
        'user-agent': userAgent,
      });

      const result = await getUserAgent();
      expect(result).toBe(userAgent);
    });

    it('should return null when user-agent header is not present', async () => {
      mockHeaders({
        'user-agent': null,
      });

      const result = await getUserAgent();
      expect(result).toBeNull();
    });
  });

  describe('getLanguage', () => {
    it('should return "en" as default language', async () => {
      mockCookies({});

      const result = await getLanguage();
      expect(result).toBe('en');
    });

    it('should return language from cookie if valid', async () => {
      mockCookies({
        lang: { value: 'fi' },
      });

      const result = await getLanguage();
      expect(result).toBe('fi');
    });

    it('should return default language for invalid cookie value', async () => {
      mockCookies({
        lang: { value: 'invalid' },
        'accept-language': { value: 'invalid' },
      });

      const result = await getLanguage();
      expect(result).toBe('en');
    });

    it('should use accept-language if valid and no valid cookie', async () => {
      mockCookies({
        lang: undefined,
        'accept-language': { value: 'fi' },
      });

      const result = await getLanguage();
      expect(result).toBe('fi');
    });

    it('should prioritize cookie over accept-language header', async () => {
      mockCookies({
        lang: { value: 'fi' },
        'accept-language': { value: 'en' },
      });

      const result = await getLanguage();
      expect(result).toBe('fi');
    });
  });

  describe('getSelectedTeam', () => {
    it('should return team ID from cookie if valid UUID', async () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      mockCookies({
        selectedTeam: { value: validUUID },
      });

      const result = await getSelectedTeam();
      expect(result).toBe(validUUID);
    });

    it('should return null if no team cookie present', async () => {
      mockCookies({});

      const result = await getSelectedTeam();
      expect(result).toBeNull();
    });

    it('should return null if team ID is not a valid UUID', async () => {
      mockCookies({
        selectedTeam: { value: 'invalid-uuid' },
      });

      const result = await getSelectedTeam();
      expect(result).toBeNull();
    });
  });
});
