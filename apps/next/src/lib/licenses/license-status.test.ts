import { License } from '@lukittu/prisma';
import {
  getLicenseStatus,
  getLicenseStatusBadgeVariant,
} from './license-status';

const createBaseLicense = (
  override: Partial<License> = {},
): Omit<License, 'licenseKeyLookup'> =>
  ({
    id: '1',
    key: 'test-key',
    userId: '1',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActiveAt: new Date(),
    suspended: false,
    expirationType: 'NEVER',
    expirationDate: null,
    ...override,
  }) as Omit<License, 'licenseKeyLookup'>;

describe('getLicenseStatus', () => {
  test('returns SUSPENDED for suspended licenses', () => {
    const license = createBaseLicense({ suspended: true });
    expect(getLicenseStatus(license)).toBe('SUSPENDED');
  });

  test('returns INACTIVE for licenses without activity for 30+ days', () => {
    const license = createBaseLicense({
      lastActiveAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });
    expect(getLicenseStatus(license)).toBe('INACTIVE');
  });

  test('returns ACTIVE for valid never-expiring licenses', () => {
    const license = createBaseLicense({
      lastActiveAt: new Date(),
    });
    expect(getLicenseStatus(license)).toBe('ACTIVE');
  });

  test('returns EXPIRED for date-based licenses past expiration', () => {
    const license = createBaseLicense({
      expirationType: 'DATE',
      expirationDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      lastActiveAt: new Date(),
    });
    expect(getLicenseStatus(license)).toBe('EXPIRED');
  });

  test('returns EXPIRING for date-based licenses within 30 days of expiration', () => {
    const license = createBaseLicense({
      expirationType: 'DATE',
      expirationDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      lastActiveAt: new Date(),
    });
    expect(getLicenseStatus(license)).toBe('EXPIRING');
  });
});

describe('getLicenseStatusBadgeVariant', () => {
  test('returns correct badge variants for each status', () => {
    expect(getLicenseStatusBadgeVariant('ACTIVE')).toBe('success');
    expect(getLicenseStatusBadgeVariant('INACTIVE')).toBe('secondary');
    expect(getLicenseStatusBadgeVariant('EXPIRING')).toBe('warning');
    expect(getLicenseStatusBadgeVariant('EXPIRED')).toBe('error');
    expect(getLicenseStatusBadgeVariant('SUSPENDED')).toBe('error');
  });
});
