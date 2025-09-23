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

interface DiscordTokenResult {
  accessToken: string;
  refreshToken: string;
  tokenRotated: boolean;
}

/**
 * Fetches Discord user by ID with caching
 * @param discordId The Discord user ID
 * @returns Discord user data or null if not found
 * @throws Error if Discord API request fails (non-404 errors)
 */
export async function fetchDiscordUserById(
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
 * @param userId User ID for caching
 * @returns OAuth token response
 * @throws Error if token exchange fails
 */
export async function exchangeDiscordAuthCode(
  code: string,
  userId: string,
): Promise<DiscordOAuthTokenResponse> {
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      redirect_uri: process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI!,
      grant_type: 'authorization_code',
      code,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Discord OAuth token exchange failed: ${response.status} - ${errorText}`,
    );
  }

  const tokenResponse = (await response.json()) as DiscordOAuthTokenResponse;

  try {
    const cacheKey = `discord_access_token:${userId}`;
    const cacheTTL = Math.max(tokenResponse.expires_in - 300, 60); // 5 minute buffer, at least 1 minute

    await redisClient.setex(cacheKey, cacheTTL, tokenResponse.access_token);

    logger.info('Cached initial Discord access token', { userId });
  } catch (error) {
    // Don't fail the OAuth flow if caching fails
    logger.warn('Failed to cache initial Discord access token', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return tokenResponse;
}

/**
 * Fetches Discord user profile using OAuth access token
 * @param accessToken OAuth access token
 * @returns Discord user profile
 * @throws Error if profile fetch fails
 */
export async function fetchDiscordUserProfile(
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
 * Refreshes Discord OAuth access token using refresh token and caches the result
 * @param refreshToken Discord OAuth refresh token
 * @param userId User ID for caching
 * @returns New OAuth token response with refreshed tokens
 * @throws Error if refresh fails
 */
async function refreshDiscordAccessToken(
  refreshToken: string,
  userId: string,
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

  const tokenResponse = (await response.json()) as DiscordOAuthTokenResponse;

  // Cache the refreshed access token
  try {
    const cacheKey = `discord_access_token:${userId}`;
    const cacheTTL = Math.max(tokenResponse.expires_in - 300, 60); // 5 minute buffer, at least 1 minute

    await redisClient.setex(cacheKey, cacheTTL, tokenResponse.access_token);

    logger.info('Cached refreshed Discord access token', { userId });
  } catch (error) {
    // Don't fail the refresh if caching fails
    logger.warn('Failed to cache refreshed Discord access token', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return tokenResponse;
}

/**
 * Revokes Discord OAuth token and clears cached access token
 * @param token Access token or refresh token to revoke
 * @param userId User ID to clear cached tokens for
 * @throws Error if revocation fails
 */
export async function revokeDiscordToken(
  token: string,
  userId: string,
): Promise<void> {
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

  // Clear cached access token since we've revoked the refresh token
  try {
    const cacheKey = `discord_access_token:${userId}`;
    await redisClient.del(cacheKey);
    logger.info('Cleared Discord access token cache after revocation', {
      userId,
    });
  } catch (error) {
    // Don't fail the revocation if cache clearing fails
    logger.warn('Failed to clear Discord access token cache after revocation', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getDiscordTokens(
  encryptedRefreshToken: string,
  userId: string,
): Promise<DiscordTokenResult | null> {
  const decryptedRefreshToken = decryptString(encryptedRefreshToken);
  const cacheKey = `discord_access_token:${userId}`;

  try {
    const cachedAccessToken = await redisClient.get(cacheKey);
    if (cachedAccessToken) {
      return {
        accessToken: cachedAccessToken,
        refreshToken: decryptedRefreshToken,
        tokenRotated: false,
      };
    }

    const tokenResponse = await refreshDiscordAccessToken(
      decryptedRefreshToken,
      userId,
    );

    const tokenRotated = tokenResponse.refresh_token !== decryptedRefreshToken;

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      tokenRotated,
    };
  } catch (error) {
    logger.error('Discord token refresh failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}
