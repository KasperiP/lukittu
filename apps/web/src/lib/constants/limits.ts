export const MAX_RELEASE_FILE_SIZE =
  (Number(process.env.NEXT_PUBLIC_MAX_RELEASE_FILE_SIZE_MB) || 30) *
  1024 *
  1024;
export const MAX_IMAGE_FILE_SIZE = 1024 * 1024;

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
};

// High Int32-safe ceiling used as "effectively unlimited" for single-tenant
// (self-hosted) deployments. Stored on the team's Limits row at creation time
// so the inline `team.limits.maxX` checks across the app are satisfied without
// needing per-route changes.
const UNLIMITED = 2_000_000_000;

export const UNLIMITED_LIMITS = {
  maxLicenses: UNLIMITED,
  maxProducts: UNLIMITED,
  logRetention: UNLIMITED,
  maxCustomers: UNLIMITED,
  maxTeamMembers: UNLIMITED,
  maxBlacklist: UNLIMITED,
  maxStorage: UNLIMITED,
  maxApiKeys: UNLIMITED,
  maxReleasesPerProduct: UNLIMITED,
  maxBranchesPerProduct: UNLIMITED,
  maxInvitations: UNLIMITED,
  maxWebhooks: UNLIMITED,

  // Watermarking and the classloader rely on services that are not part of this
  // repository / not publicly available, so they stay disabled when self-hosting.
  allowClassloader: false,
  allowCustomEmails: true,
  allowWatermarking: false,
};
