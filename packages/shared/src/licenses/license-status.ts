import { License } from '../..';

export type LicenseStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'SUSPENDED';

export const getLicenseStatus = (
  license: Omit<License, 'licenseKeyLookup'>,
): LicenseStatus => {
  const currentDate = new Date();

  if (license.suspended) {
    return 'SUSPENDED';
  }

  const lastActiveDate = new Date(license.lastActiveAt);

  if (license.expirationType === 'NEVER') {
    // Inactive if over 30 days since last activity
    if (
      currentDate.getTime() - lastActiveDate.getTime() >
      30 * 24 * 60 * 60 * 1000
    ) {
      return 'INACTIVE';
    }

    return 'ACTIVE';
  }

  if (license.expirationType === 'DATE') {
    if (currentDate.getTime() > new Date(license.expirationDate!).getTime()) {
      return 'EXPIRED';
    }

    if (
      currentDate.getTime() >
      new Date(license.expirationDate!).getTime() - 30 * 24 * 60 * 60 * 1000
    ) {
      return 'EXPIRING';
    }

    if (
      currentDate.getTime() - lastActiveDate.getTime() >
      30 * 24 * 60 * 60 * 1000
    ) {
      return 'INACTIVE';
    }

    return 'ACTIVE';
  }

  const hasStartedExpiring = Boolean(license.expirationDate);

  if (hasStartedExpiring) {
    if (currentDate.getTime() > new Date(license.expirationDate!).getTime()) {
      return 'EXPIRED';
    }

    if (
      currentDate.getTime() >
      new Date(license.expirationDate!).getTime() - 30 * 24 * 60 * 60 * 1000
    ) {
      return 'EXPIRING';
    }
  }

  if (
    currentDate.getTime() - lastActiveDate.getTime() >
    30 * 24 * 60 * 60 * 1000
  ) {
    return 'INACTIVE';
  }

  return 'ACTIVE';
};
