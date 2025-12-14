import {
  LicenseExpirationStart,
  LicenseExpirationType,
} from '../../prisma/generated/enums';
import {
  calculateLicenseExpirationDate,
  calculateUpdatedLicenseExpirationDate,
} from './license-expiration';

describe('License Expiration Utilities', () => {
  describe('calculateLicenseExpirationDate', () => {
    it('should calculate expiration date when starting from creation with duration days', () => {
      const now = Date.now();
      const expirationDays = 30;

      const result = calculateLicenseExpirationDate({
        expirationStart: LicenseExpirationStart.CREATION,
        expirationType: LicenseExpirationType.DURATION,
        expirationDays,
        expirationDate: null,
      });

      expect(result).toBeTruthy();
      expect(result!.getTime()).toBeCloseTo(
        now + expirationDays * 24 * 60 * 60 * 1000,
        -5, // tolerance of 100ms
      );
    });

    it('should return provided expiration date when not starting from creation', () => {
      const providedDate = new Date('2024-12-31');

      const result = calculateLicenseExpirationDate({
        expirationStart: LicenseExpirationStart.ACTIVATION,
        expirationType: LicenseExpirationType.DURATION,
        expirationDays: 30,
        expirationDate: providedDate,
      });

      expect(result).toBe(providedDate);
    });

    it('should return provided expiration date when no expiration days', () => {
      const providedDate = new Date('2024-12-31');

      const result = calculateLicenseExpirationDate({
        expirationStart: LicenseExpirationStart.CREATION,
        expirationType: LicenseExpirationType.DURATION,
        expirationDays: null,
        expirationDate: providedDate,
      });

      expect(result).toBe(providedDate);
    });

    it('should return null when no expiration date provided', () => {
      const result = calculateLicenseExpirationDate({
        expirationStart: LicenseExpirationStart.ACTIVATION,
        expirationType: LicenseExpirationType.DURATION,
        expirationDays: null,
        expirationDate: null,
      });

      expect(result).toBeNull();
    });
  });

  describe('calculateUpdatedLicenseExpirationDate', () => {
    it('should calculate new expiration date for duration license starting from creation', () => {
      const now = Date.now();
      const expirationDays = 30;

      const result = calculateUpdatedLicenseExpirationDate({
        expirationType: LicenseExpirationType.DURATION,
        expirationStart: LicenseExpirationStart.CREATION,
        expirationDays,
        expirationDate: null,
        existingLicense: {
          expirationType: LicenseExpirationType.DATE,
          expirationDate: null,
        },
      });

      expect(result).toBeTruthy();
      expect(result!.getTime()).toBeCloseTo(
        now + expirationDays * 24 * 60 * 60 * 1000,
        -5,
      );
    });

    it('should not recalculate if license was previously duration and has expiration date', () => {
      const providedDate = new Date('2024-12-31');

      const result = calculateUpdatedLicenseExpirationDate({
        expirationType: LicenseExpirationType.DURATION,
        expirationStart: LicenseExpirationStart.CREATION,
        expirationDays: 30,
        expirationDate: providedDate,
        existingLicense: {
          expirationType: LicenseExpirationType.DURATION,
          expirationDate: new Date('2024-01-01'),
        },
      });

      expect(result).toBe(providedDate);
    });

    it('should return provided expiration date for non-duration licenses', () => {
      const providedDate = new Date('2024-12-31');

      const result = calculateUpdatedLicenseExpirationDate({
        expirationType: LicenseExpirationType.DATE,
        expirationStart: LicenseExpirationStart.CREATION,
        expirationDays: 30,
        expirationDate: providedDate,
        existingLicense: {
          expirationType: LicenseExpirationType.DATE,
          expirationDate: null,
        },
      });

      expect(result).toBe(providedDate);
    });

    it('should return provided expiration date when starting from activation', () => {
      const providedDate = new Date('2024-12-31');

      const result = calculateUpdatedLicenseExpirationDate({
        expirationType: LicenseExpirationType.DURATION,
        expirationStart: LicenseExpirationStart.ACTIVATION,
        expirationDays: 30,
        expirationDate: providedDate,
        existingLicense: {
          expirationType: LicenseExpirationType.DATE,
          expirationDate: null,
        },
      });

      expect(result).toBe(providedDate);
    });
  });
});
