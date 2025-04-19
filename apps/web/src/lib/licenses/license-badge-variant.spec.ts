import { getLicenseStatusBadgeVariant } from './license-badge-variant';

describe('getLicenseStatusBadgeVariant', () => {
  test('returns correct badge variants for each status', () => {
    expect(getLicenseStatusBadgeVariant('ACTIVE')).toBe('success');
    expect(getLicenseStatusBadgeVariant('INACTIVE')).toBe('secondary');
    expect(getLicenseStatusBadgeVariant('EXPIRING')).toBe('warning');
    expect(getLicenseStatusBadgeVariant('EXPIRED')).toBe('error');
    expect(getLicenseStatusBadgeVariant('SUSPENDED')).toBe('error');
  });
});
