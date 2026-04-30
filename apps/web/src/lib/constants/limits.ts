export const MAX_RELEASE_FILE_SIZE =
  (Number(process.env.NEXT_PUBLIC_MAX_RELEASE_FILE_SIZE_MB) || 10) *
  1024 *
  1024;
export const MAX_ANALYZER_FILE_SIZE =
  (Number(process.env.NEXT_PUBLIC_MAX_ANALYZER_FILE_SIZE_MB) || 50) *
  1024 *
  1024;

export const DEFAULT_LIMITS = {
  maxLicenses: 100,
  maxProducts: 3,
  logRetention: 30,
  maxCustomers: 100,
  maxTeamMembers: 3,
  maxBlacklist: 100,
  maxStorage: 0,
  maxApiKeys: 10,
  maxReleasesPerProduct: 100,
  maxInvitations: 100,
  allowClassloader: false,
  allowCustomEmails: false,
  allowWatermarking: false,
};
