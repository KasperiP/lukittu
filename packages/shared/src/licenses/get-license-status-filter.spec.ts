import { LicenseStatus } from './get-license-status';
import { getLicenseStatusFilter } from './get-license-status-filter';

describe('getLicenseStatusFilter', () => {
  const currentDate = new Date();
  const thirtyDaysAgo = new Date(
    currentDate.getTime() - 30 * 24 * 60 * 60 * 1000,
  );
  const thirtyDaysFromNow = new Date(
    currentDate.getTime() + 30 * 24 * 60 * 60 * 1000,
  );

  beforeAll(() => {
    // Mock Date.now() to ensure consistent test results
    jest.useFakeTimers();
    jest.setSystemTime(currentDate);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('returns filter for ACTIVE licenses', () => {
    const filter = getLicenseStatusFilter(LicenseStatus.ACTIVE);

    expect(filter).toEqual({
      suspended: false,
      lastActiveAt: {
        gt: thirtyDaysAgo,
      },
      OR: [
        { expirationType: 'NEVER' },
        {
          AND: [
            {
              expirationType: {
                in: ['DATE', 'DURATION'],
              },
            },
            {
              expirationDate: {
                gt: currentDate,
              },
            },
            {
              expirationDate: {
                gt: thirtyDaysFromNow,
              },
            },
          ],
        },
      ],
    });
  });

  test('returns filter for INACTIVE licenses', () => {
    const filter = getLicenseStatusFilter(LicenseStatus.INACTIVE);

    expect(filter).toEqual({
      suspended: false,
      lastActiveAt: {
        lte: thirtyDaysAgo,
      },
      OR: [
        { expirationType: 'NEVER' },
        {
          AND: [
            { expirationType: { in: ['DATE', 'DURATION'] } },
            {
              expirationDate: {
                gt: currentDate,
              },
            },
            {
              expirationDate: {
                gt: thirtyDaysFromNow,
              },
            },
          ],
        },
      ],
    });
  });

  test('returns filter for EXPIRING licenses', () => {
    const filter = getLicenseStatusFilter(LicenseStatus.EXPIRING);

    expect(filter).toEqual({
      suspended: false,
      expirationType: {
        in: ['DATE', 'DURATION'],
      },
      expirationDate: {
        gt: currentDate,
        lt: thirtyDaysFromNow,
      },
    });
  });

  test('returns filter for EXPIRED licenses', () => {
    const filter = getLicenseStatusFilter(LicenseStatus.EXPIRED);

    expect(filter).toEqual({
      suspended: false,
      expirationType: {
        in: ['DATE', 'DURATION'],
      },
      expirationDate: {
        lt: currentDate,
      },
    });
  });

  test('returns filter for UPCOMING licenses', () => {
    const filter = getLicenseStatusFilter(LicenseStatus.UPCOMING);

    expect(filter).toEqual({
      suspended: false,
      expirationType: 'DURATION',
      expirationStart: 'ACTIVATION',
      expirationDate: {
        equals: null,
      },
    });
  });

  test('returns filter for SUSPENDED licenses', () => {
    const filter = getLicenseStatusFilter(LicenseStatus.SUSPENDED);

    expect(filter).toEqual({
      suspended: true,
    });
  });

  test('returns empty filter for null status', () => {
    const filter = getLicenseStatusFilter(null);

    expect(filter).toEqual({});
  });

  test('returns empty filter for "ALL" status', () => {
    const filter = getLicenseStatusFilter('ALL');

    expect(filter).toEqual({});
  });

  test('returns empty filter for undefined status', () => {
    const filter = getLicenseStatusFilter(undefined as any);

    expect(filter).toEqual({});
  });
});
