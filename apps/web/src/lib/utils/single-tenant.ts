/**
 * Whether the instance runs in single-tenant (self-hosted) mode.
 *
 * In single-tenant mode the first signup becomes the sole owner of the
 * instance; afterwards public registration and OAuth login are disabled and
 * per-team usage limits are bypassed (teams are created with unlimited limits).
 * Multi-tenant (SaaS) is the default.
 *
 * Backed by `NEXT_PUBLIC_SINGLE_TENANT_MODE` so the same flag can be read from
 * both server routes and client components. It is a config flag, not a secret.
 */
export function isSingleTenantMode(): boolean {
  return process.env.NEXT_PUBLIC_SINGLE_TENANT_MODE === 'true';
}
