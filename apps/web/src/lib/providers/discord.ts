import { decryptString, logger } from '@lukittu/shared';
import 'server-only';
import { redisClient } from '../database/redis';

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  global_name: string | null;
}

export interface DiscordOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface DiscordHealthResult {
  tokenValid: boolean;
  refreshTokenRotated: boolean;
  newRefreshToken?: string;
}

/**
 * Fetches Discord user by ID with caching
 * @param discordId The Discord user ID
 * @returns Discord user data or null if not found
 * @throws Error if Discord API request fails (non-404 errors)
 */
export async function getDiscordUser(
  discordId: string,
): Promise<DiscordUser | null> {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/users/${discordId}`,
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },

        // Cache for 5 minutes - Discord user data doesn't change frequently
        next: { revalidate: 300 },
      },
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

/**
 * Exchanges Discord OAuth code for access token
 * @param code OAuth authorization code
 * @param redirectUri Redirect URI used in OAuth
 * @returns OAuth token response
 * @throws Error if token exchange fails
 */
export async function exchangeDiscordCode(
  code: string,
  redirectUri: string,
): Promise<DiscordOAuthTokenResponse> {
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Discord OAuth token exchange failed: ${response.status} - ${errorText}`,
    );
  }

  return await response.json();
}

/**
 * Fetches Discord user profile using OAuth access token
 * @param accessToken OAuth access token
 * @returns Discord user profile
 * @throws Error if profile fetch fails
 */
export async function getDiscordUserProfile(
  accessToken: string,
): Promise<DiscordUser> {
  const response = await fetch('https://discord.com/api/v10/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Discord user profile fetch failed: ${response.status}`);
  }

  return await response.json();
}

/**
 * Refreshes Discord OAuth access token using refresh token
 * @param refreshToken Discord OAuth refresh token
 * @returns New OAuth token response with refreshed tokens
 * @throws Error if refresh fails
 */
export async function refreshDiscordToken(
  refreshToken: string,
): Promise<DiscordOAuthTokenResponse> {
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Discord OAuth token refresh failed: ${response.status} - ${errorText}`,
    );
  }

  return await response.json();
}

/**
 * Revokes Discord OAuth token
 * @param token Access token or refresh token to revoke
 * @throws Error if revocation fails
 */
export async function revokeDiscordToken(token: string): Promise<void> {
  const response = await fetch('https://discord.com/api/oauth2/token/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      token,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Discord OAuth token revocation failed: ${response.status} - ${errorText}`,
    );
  }
}

/**
 * Validates Discord refresh token and handles token rotation
 * @param refreshToken Discord OAuth refresh token
 * @returns Health result with validation status and any new refresh token
 */
export async function validateDiscordRefreshToken(
  refreshToken: string,
): Promise<DiscordHealthResult> {
  try {
    const tokenResponse = await refreshDiscordToken(refreshToken);

    return {
      tokenValid: true,
      refreshTokenRotated: tokenResponse.refresh_token !== refreshToken,
      newRefreshToken: tokenResponse.refresh_token,
    };
  } catch {
    return {
      tokenValid: false,
      refreshTokenRotated: false,
    };
  }
}

/**
 * Validates Discord refresh token with Redis caching
 * Caches validation results for 5 minutes to reduce Discord API calls
 * @param encryptedRefreshToken Discord OAuth refresh token (encrypted)
 * @param userId User ID for cache key uniqueness
 * @returns Health result with validation status and any new refresh token
 */
export async function validateDiscordRefreshTokenCached(
  encryptedRefreshToken: string,
  userId: string,
): Promise<DiscordHealthResult> {
  const decryptedRefreshToken = decryptString(encryptedRefreshToken);

  const cacheKey = `discord_token_validation:${userId}`;
  const cacheTTL = 300; // 5 minutes

  try {
    // Check cache first
    const cachedResult = await redisClient.get(cacheKey);
    if (cachedResult) {
      const parsed = JSON.parse(cachedResult) as DiscordHealthResult & {
        refreshToken: string;
      };

      // Only use cached result if the refresh token hasn't changed
      if (parsed.refreshToken === decryptedRefreshToken) {
        // Return cached result without the stored refresh token
        const { refreshToken: _, ...result } = parsed;
        return result;
      }
    }

    // Cache miss or token changed - perform validation
    const result = await validateDiscordRefreshToken(decryptedRefreshToken);

    // Cache the result along with the refresh token for comparison
    const cacheData = {
      ...result,
      refreshToken: result.newRefreshToken || decryptedRefreshToken,
    };

    await redisClient.setex(cacheKey, cacheTTL, JSON.stringify(cacheData));

    return result;
  } catch (error) {
    // If Redis fails, fall back to direct validation
    logger.error('Redis cache error, falling back to direct validation', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return validateDiscordRefreshToken(decryptedRefreshToken);
  }
}
