import { headers } from 'next/headers';
import { getCloudflareVisitorData, verifyTurnstileToken } from './cloudflare';

jest.mock('next/headers');
jest.mock('../logging/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('verifyTurnstileToken', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return true for valid token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    const result = await verifyTurnstileToken('valid-token');
    expect(result).toBe(true);
  });

  it('should return false for invalid token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false }),
    });

    const result = await verifyTurnstileToken('invalid-token');
    expect(result).toBe(false);
  });

  it('should return false on fetch error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await verifyTurnstileToken('token');
    expect(result).toBe(false);
  });
});

describe('getCloudflareVisitorData', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return visitor data when all headers are present', async () => {
    jest.mocked(headers).mockReturnValue(
      new Map([
        ['cf-ipcountry', 'US'],
        ['cf-iplongitude', '-122.4194'],
        ['cf-iplatitude', '37.7749'],
      ]) as any,
    );

    const result = await getCloudflareVisitorData();
    expect(result).toEqual({
      alpha2: 'US',
      alpha3: 'USA',
      long: -122.4194,
      lat: 37.7749,
    });
  });

  it('should return null when headers are missing', async () => {
    jest.mocked(headers).mockReturnValue(new Map() as any);

    const result = await getCloudflareVisitorData();
    expect(result).toBeNull();
  });

  it('should return null when some headers are missing', async () => {
    jest.mocked(headers).mockReturnValue(
      new Map([
        ['cf-ipcountry', 'US'],
        ['cf-iplongitude', '-122.4194'],
      ]) as any,
    );

    const result = await getCloudflareVisitorData();
    expect(result).toBeNull();
  });
});
