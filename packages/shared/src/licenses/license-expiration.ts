import {
  LicenseExpirationStart,
  LicenseExpirationType,
} from '../../prisma/generated/enums';

interface LicenseExpirationParams {
  expirationStart: LicenseExpirationStart;
  expirationType: LicenseExpirationType;
  expirationDays?: number | null;
  expirationDate?: Date | null;
}

interface ExistingLicenseExpirationParams extends LicenseExpirationParams {
  existingLicense?: {
    expirationType: LicenseExpirationType;
    expirationDate: Date | null;
  } | null;
}

/**
 * Calculates the expiration date for a new license based on the provided parameters.
 * Used when creating new licenses.
 */
export const calculateLicenseExpirationDate = (
  params: LicenseExpirationParams,
): Date | null => {
  const { expirationStart, expirationDays, expirationDate } = params;

  // If expiration starts from creation and we have duration days, calculate from now
  if (expirationStart === LicenseExpirationStart.CREATION && expirationDays) {
    return new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);
  }

  // Otherwise, use the provided expiration date (could be null)
  return expirationDate || null;
};

/**
 * Calculates the expiration date for updating an existing license.
 * Handles complex logic for duration-based licenses that may have already started expiring.
 */
export const calculateUpdatedLicenseExpirationDate = (
  params: ExistingLicenseExpirationParams,
): Date | null => {
  const {
    expirationType,
    expirationStart,
    expirationDays,
    expirationDate,
    existingLicense,
  } = params;

  const isDurationType = expirationType === LicenseExpirationType.DURATION;
  const startsExpiringFromCreation =
    expirationStart === LicenseExpirationStart.CREATION;
  const wasPreviouslyDuration =
    existingLicense?.expirationType === LicenseExpirationType.DURATION;
  const hasPreviousExpirationDate = Boolean(existingLicense?.expirationDate);

  // For duration licenses that start expiring from creation:
  // Only calculate new expiration date if:
  // 1. It's a duration type
  // 2. It starts expiring from creation
  // 3. Either no previous expiration date exists OR it wasn't previously a duration type
  // 4. We have expiration days specified
  if (
    isDurationType &&
    startsExpiringFromCreation &&
    (!hasPreviousExpirationDate || !wasPreviouslyDuration) &&
    expirationDays
  ) {
    return new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);
  }

  // Otherwise, use the provided expiration date
  return expirationDate || null;
};
