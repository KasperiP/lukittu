import { LicenseStatus } from '@lukittu/shared';
import { getLicenseStatusBadgeVariant } from './license-badge-variant';

describe('getLicenseStatusBadgeVariant', () => {
  test('returns correct badge variants for each status', () => {
    expect(getLicenseStatusBadgeVariant(LicenseStatus.ACTIVE)).toBe('success');
    expect(getLicenseStatusBadgeVariant(LicenseStatus.INACTIVE)).toBe(
      'secondary',
    );
    expect(getLicenseStatusBadgeVariant(LicenseStatus.EXPIRING)).toBe(
      'warning',
    );
    expect(getLicenseStatusBadgeVariant(LicenseStatus.EXPIRED)).toBe('error');
    expect(getLicenseStatusBadgeVariant(LicenseStatus.SUSPENDED)).toBe('error');
  });
});
