import { decryptString, encryptString, logger, prisma } from '@lukittu/shared';
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

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  features: string[];
}

export interface DiscordGuildMember {
  user?: DiscordUser;
  nick?: string;
  roles: string[];
  joined_at: string;
  premium_since?: string;
  permissions?: string;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  icon?: string | null;
  unicode_emoji?: string | null;
  position: number;
  permissions: string;
  managed: boolean;
  mentionable: boolean;
  tags?: {
    bot_id?: string;
    integration_id?: string;
    premium_subscriber?: null;
    subscription_listing_id?: string;
    available_for_purchase?: null;
    guild_connections?: null;
  };
}

interface DiscordTokenResult {
  accessToken: string;
  refreshToken: string;
  tokenRotated: boolean;
}

interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  reset?: number;
  resetAfter?: number;
  global?: boolean;
}

interface DiscordApiResponse {
  response: Response;
  rateLimitInfo: RateLimitInfo;
}

/**
 * Discord permission constants
 * @see https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags
 */
const DiscordPermissions = {
  ADMINISTRATOR: 0x8,
  MANAGE_ROLES: 0x10000000,
} as const;

/**
 * Parses rate limit information from Discord API response headers
 * @param response The fetch response from Discord API
 * @returns Rate limit information
 */
function parseRateLimitHeaders(response: Response): RateLimitInfo {
  return {
    limit: response.headers.get('x-ratelimit-limit')
      ? parseInt(response.headers.get('x-ratelimit-limit')!)
      : undefined,
    remaining: response.headers.get('x-ratelimit-remaining')
      ? parseInt(response.headers.get('x-ratelimit-remaining')!)
      : undefined,
    reset: response.headers.get('x-ratelimit-reset')
      ? parseInt(response.headers.get('x-ratelimit-reset')!)
      : undefined,
    resetAfter: response.headers.get('x-ratelimit-reset-after')
      ? parseFloat(response.headers.get('x-ratelimit-reset-after')!)
      : undefined,
    global: response.headers.get('x-ratelimit-global') === 'true',
  };
}

/**
 * Makes a Discord API request with proper rate limit handling and retries
 * @param url The API endpoint URL
 * @param options Fetch options
 * @param maxRetries Maximum number of retries for rate limited requests
 * @param context Context string for logging
 * @returns Promise resolving to DiscordApiResponse
 */
async function makeDiscordApiRequest(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  context = 'Discord API',
): Promise<DiscordApiResponse> {
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, options);
      const rateLimitInfo = parseRateLimitHeaders(response);

      // Log rate limit information for monitoring
      if (
        rateLimitInfo.remaining !== undefined &&
        rateLimitInfo.remaining < 5
      ) {
        logger.warn('Discord API rate limit approaching', {
          context,
          remaining: rateLimitInfo.remaining,
          limit: rateLimitInfo.limit,
          resetAfter: rateLimitInfo.resetAfter,
        });
      }

      // Handle rate limiting (429 status)
      if (response.status === 429) {
        const retryAfter =
          rateLimitInfo.resetAfter ||
          parseFloat(response.headers.get('retry-after') || '1');

        if (attempt < maxRetries) {
          logger.warn('Discord API rate limited, retrying', {
            context,
            attempt: attempt + 1,
            retryAfter,
            global: rateLimitInfo.global,
          });

          // Wait for the specified retry-after time (convert to milliseconds)
          await new Promise((resolve) =>
            setTimeout(resolve, retryAfter * 1000),
          );
          attempt++;
          continue;
        } else {
          logger.error('Discord API rate limit exceeded max retries', {
            context,
            maxRetries,
            retryAfter,
          });

          // Return the rate limited response for the caller to handle
          return { response, rateLimitInfo };
        }
      }

      // Return successful or non-rate-limited error response
      return { response, rateLimitInfo };
    } catch (error) {
      if (attempt < maxRetries) {
        logger.warn('Discord API request failed, retrying', {
          context,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error),
        });

        // Wait with exponential backoff for network errors
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000),
        );
        attempt++;
        continue;
      } else {
        throw error;
      }
    }
  }

  // This should never be reached, but TypeScript requires it
  throw new Error('Unexpected end of Discord API request function');
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
  const cacheKey = `discord_user:${discordId}`;
  const cacheTTL = 300; // 5 minutes

  try {
    // Try to get from cache first
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const { response } = await makeDiscordApiRequest(
      `https://discord.com/api/v10/users/${discordId}`,
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
      },
      3,
      `fetchDiscordUserById(${discordId})`,
    );

    if (response.status === 404) {
      // Cache the null result for a shorter time to avoid repeated API calls
      await redisClient.setex(cacheKey, 60, JSON.stringify(null));
      return null;
    }

    if (!response.ok) {
      let responseData;
      if (response.headers.get('content-type')?.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      logger.error('Failed to fetch Discord user by ID', {
        discordId,
        status: response.status,
        error: responseData,
      });

      throw new Error(`Discord user fetch failed: ${response.status}`);
    }

    const userData = await response.json();

    // Cache the successful result
    try {
      await redisClient.setex(cacheKey, cacheTTL, JSON.stringify(userData));
    } catch (cacheError) {
      logger.warn('Failed to cache Discord user data', {
        discordId,
        error:
          cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }

    return userData;
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
    let responseData;
    if (response.headers.get('content-type')?.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    logger.error('Failed to exchange Discord auth code', {
      userId,
      status: response.status,
      error: responseData,
    });

    throw new Error(`Discord OAuth token exchange failed: ${response.status}`);
  }

  const tokenResponse = (await response.json()) as DiscordOAuthTokenResponse;

  try {
    const cacheKey = `discord_access_token:${userId}`;
    const cacheTTL = Math.max(tokenResponse.expires_in - 300, 60); // 5 minute buffer, at least 1 minute
    const encryptedAccessToken = encryptString(tokenResponse.access_token);

    await redisClient.setex(cacheKey, cacheTTL, encryptedAccessToken);

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
  const { response } = await makeDiscordApiRequest(
    'https://discord.com/api/v10/users/@me',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    3,
    'fetchDiscordUserProfile',
  );

  if (!response.ok) {
    let responseData;
    if (response.headers.get('content-type')?.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    logger.error('Failed to fetch Discord user profile', {
      status: response.status,
      error: responseData,
    });

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
    let responseData;
    if (response.headers.get('content-type')?.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    logger.error('Failed to refresh Discord access token', {
      userId,
      status: response.status,
      error: responseData,
    });

    throw new Error(`Discord OAuth token refresh failed: ${response.status}`);
  }

  const tokenResponse = (await response.json()) as DiscordOAuthTokenResponse;

  // Cache the refreshed access token
  try {
    const cacheKey = `discord_access_token:${userId}`;
    const cacheTTL = Math.max(tokenResponse.expires_in - 300, 60); // 5 minute buffer, at least 1 minute
    const encryptedAccessToken = encryptString(tokenResponse.access_token);

    await redisClient.setex(cacheKey, cacheTTL, encryptedAccessToken);

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
    let responseData;
    if (response.headers.get('content-type')?.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    logger.error('Failed to revoke Discord token', {
      userId,
      status: response.status,
      error: responseData,
    });

    throw new Error(`Discord token revocation failed: ${response.status}`);
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
    const cachedEncryptedAccessToken = await redisClient.get(cacheKey);
    if (cachedEncryptedAccessToken) {
      try {
        const decryptedAccessToken = decryptString(cachedEncryptedAccessToken);
        return {
          accessToken: decryptedAccessToken,
          refreshToken: decryptedRefreshToken,
          tokenRotated: false,
        };
      } catch (decryptError) {
        logger.warn(
          'Failed to decrypt cached Discord access token, refreshing',
          {
            userId,
            error:
              decryptError instanceof Error
                ? decryptError.message
                : String(decryptError),
          },
        );

        // Clear the invalid cached token and continue to refresh
        await redisClient.del(cacheKey);
      }
    }

    const tokenResponse = await refreshDiscordAccessToken(
      decryptedRefreshToken,
      userId,
    );

    const tokenRotated = tokenResponse.refresh_token !== decryptedRefreshToken;

    // Update refresh token if it was rotated
    if (tokenRotated) {
      await prisma.userDiscordAccount.update({
        where: { userId },
        data: {
          refreshToken: encryptString(tokenResponse.refresh_token),
        },
      });
    }

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

/**
 * Fetches user's Discord guilds using OAuth access token
 * @param accessToken OAuth access token
 * @param userDiscordId User's Discord ID for caching
 * @returns Array of Discord guilds the user is a member of
 * @throws Error if guild fetch fails
 */
export async function fetchDiscordUserGuilds(
  accessToken: string,
  userDiscordId: string,
): Promise<DiscordGuild[]> {
  const cacheKey = `discord_user_guilds:${userDiscordId}`;
  const cacheTTL = 180; // 3 minutes (guild membership can change more frequently)

  // Try to get from cache first if userDiscordId is provided
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (cacheError) {
    logger.warn('Failed to read Discord user guilds cache', {
      userDiscordId,
      error:
        cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
  }

  const { response } = await makeDiscordApiRequest(
    'https://discord.com/api/v10/users/@me/guilds',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    3,
    `fetchDiscordUserGuilds(${userDiscordId})`,
  );

  if (!response.ok) {
    let responseData;
    if (response.headers.get('content-type')?.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    logger.error('Failed to fetch Discord user guilds', {
      status: response.status,
      error: responseData,
    });

    throw new Error(`Discord user guilds fetch failed: ${response.status}`);
  }

  const guildsData = await response.json();

  try {
    await redisClient.setex(cacheKey, cacheTTL, JSON.stringify(guildsData));
  } catch (cacheError) {
    logger.warn('Failed to cache Discord user guilds data', {
      userDiscordId,
      error:
        cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
  }

  return guildsData;
}

/**
 * Fetches bot's guilds to check which guilds the bot is in
 * @returns Array of Discord guilds the bot is a member of
 * @throws Error if guild fetch fails
 */
export async function fetchBotGuilds(): Promise<DiscordGuild[]> {
  const cacheKey = 'discord_bot_guilds';
  const cacheTTL = 300; // 5 minutes

  try {
    // Try to get from cache first
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (cacheError) {
    logger.warn('Failed to read Discord bot guilds cache', {
      error:
        cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
  }

  const { response } = await makeDiscordApiRequest(
    'https://discord.com/api/v10/users/@me/guilds',
    {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
    },
    3,
    'fetchBotGuilds',
  );

  if (!response.ok) {
    let responseData;
    if (response.headers.get('content-type')?.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    logger.error('Failed to fetch Discord bot guilds', {
      status: response.status,
      error: responseData,
    });

    throw new Error(`Discord bot guilds fetch failed: ${response.status}`);
  }

  const guildsData = await response.json();

  // Cache the result
  try {
    await redisClient.setex(cacheKey, cacheTTL, JSON.stringify(guildsData));
  } catch (cacheError) {
    logger.warn('Failed to cache Discord bot guilds data', {
      error:
        cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
  }

  return guildsData;
}

/**
 * Checks if a permission bitfield includes specific permissions
 * @param permissions Permission bitfield as string
 * @param requiredPermission Permission constant to check for
 * @returns True if has the required permission or administrator permission
 */
export function hasPermission(
  permissions: string,
  requiredPermission: number,
): boolean {
  try {
    const permissionBits = BigInt(permissions);
    const required = BigInt(requiredPermission);
    const admin = BigInt(DiscordPermissions.ADMINISTRATOR);

    // Administrator permission grants all permissions
    if ((permissionBits & admin) === admin) {
      return true;
    }

    // Check for specific permission
    return (permissionBits & required) === required;
  } catch (error) {
    logger.warn('Invalid permission bitfield', {
      permissions,
      requiredPermission,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Checks if a permission number includes MANAGE_ROLES permission
 * @param permissions Permission bitfield as string
 * @returns True if has manage roles permission or administrator permission
 */
export function hasManageRolesPermission(permissions: string): boolean {
  return hasPermission(permissions, DiscordPermissions.MANAGE_ROLES);
}

/**
 * Gets a list of permissions that a user has from the defined permission constants
 * @param permissions Permission bitfield as string
 * @returns Array of permission names the user has
 */
export function getUserPermissions(permissions: string): string[] {
  const userPermissions: string[] = [];

  try {
    const permissionBits = BigInt(permissions);

    for (const [permissionName, permissionValue] of Object.entries(
      DiscordPermissions,
    )) {
      if (
        (permissionBits & BigInt(permissionValue)) ===
        BigInt(permissionValue)
      ) {
        userPermissions.push(permissionName);
      }
    }

    return userPermissions;
  } catch (error) {
    logger.warn('Failed to parse user permissions', {
      permissions,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Validates if a permissions string is valid
 * @param permissions Permission bitfield as string
 * @returns True if valid permissions string
 */
export function isValidPermissions(permissions: string): boolean {
  try {
    BigInt(permissions);
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds common guilds where both user and bot have manage roles permissions
 * @param userGuilds User's Discord guilds
 * @param botGuilds Bot's Discord guilds
 * @returns Array of guilds where both have manage roles permissions
 */
export function findCommonGuildsWithPermissions(
  userGuilds: DiscordGuild[],
  botGuilds: DiscordGuild[],
): DiscordGuild[] {
  const botGuildIds = new Set(botGuilds.map((guild) => guild.id));

  return userGuilds.filter((userGuild) => {
    // Check if bot is in this guild
    if (!botGuildIds.has(userGuild.id)) {
      return false;
    }

    // Validate permissions strings
    if (!isValidPermissions(userGuild.permissions)) {
      logger.warn('Invalid user guild permissions', {
        guildId: userGuild.id,
        permissions: userGuild.permissions,
      });
      return false;
    }

    // Check if user has manage roles permission
    const userHasPermission =
      userGuild.owner || hasManageRolesPermission(userGuild.permissions);
    if (!userHasPermission) {
      return false;
    }

    // Find bot guild info to check bot permissions
    const botGuild = botGuilds.find((guild) => guild.id === userGuild.id);
    if (!botGuild) {
      return false;
    }

    // Validate bot permissions string
    if (!isValidPermissions(botGuild.permissions)) {
      logger.warn('Invalid bot guild permissions', {
        guildId: botGuild.id,
        permissions: botGuild.permissions,
      });
      return false;
    }

    // Check if bot has manage roles permission
    const botHasPermission =
      botGuild.owner || hasManageRolesPermission(botGuild.permissions);

    return botHasPermission;
  });
}

/**
 * Fetches roles for a specific guild
 * @param guildId Guild ID
 * @returns Array of Discord roles in the guild
 * @throws Error if fetch fails
 */
export async function fetchGuildRoles(guildId: string): Promise<DiscordRole[]> {
  const cacheKey = `discord_guild_roles:${guildId}`;
  const cacheTTL = 300; // 5 minutes

  try {
    // Try to get from cache first
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (cacheError) {
    logger.warn('Failed to read Discord guild roles cache', {
      guildId,
      error:
        cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
  }

  const { response } = await makeDiscordApiRequest(
    `https://discord.com/api/v10/guilds/${guildId}/roles`,
    {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
    },
    3,
    `fetchGuildRoles(${guildId})`,
  );

  if (!response.ok) {
    let responseData;
    if (response.headers.get('content-type')?.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    logger.error('Failed to fetch Discord guild roles', {
      guildId,
      status: response.status,
      error: responseData,
    });

    throw new Error(`Discord guild roles fetch failed: ${response.status}`);
  }

  const rolesData = await response.json();

  // Cache the result
  try {
    await redisClient.setex(cacheKey, cacheTTL, JSON.stringify(rolesData));
  } catch (cacheError) {
    logger.warn('Failed to cache Discord guild roles data', {
      guildId,
      error:
        cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
  }

  return rolesData;
}

/**
 * Fetches user's member info for a specific guild using OAuth token
 * @param guildId Guild ID
 * @param accessToken OAuth access token
 * @param userDiscordId User's Discord ID for caching
 * @returns User's member info or null if not in guild
 * @throws Error if fetch fails (non-404 errors)
 */
export async function fetchUserGuildMember(
  guildId: string,
  accessToken: string,
  userDiscordId: string,
): Promise<DiscordGuildMember | null> {
  const cacheKey = `discord_user_member:${userDiscordId}:${guildId}`;
  const cacheTTL = 180; // 3 minutes (member data can change)

  // Try to get from cache first if userDiscordId is provided
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (cacheError) {
    logger.warn('Failed to read Discord user guild member cache', {
      userDiscordId,
      guildId,
      error:
        cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
  }

  try {
    const { response } = await makeDiscordApiRequest(
      `https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      3,
      `fetchUserGuildMember(${userDiscordId}, ${guildId})`,
    );

    if (response.status === 404) {
      // Cache the null result for a shorter time
      try {
        await redisClient.setex(cacheKey, 60, JSON.stringify(null));
      } catch (cacheError) {
        logger.warn('Failed to cache Discord user guild member null result', {
          userDiscordId,
          guildId,
          error:
            cacheError instanceof Error
              ? cacheError.message
              : String(cacheError),
        });
      }
      return null;
    }

    if (!response.ok) {
      let responseData;
      if (response.headers.get('content-type')?.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      logger.error('Failed to fetch Discord user guild member', {
        guildId,
        status: response.status,
        error: responseData,
      });

      throw new Error(
        `Discord user guild member fetch failed: ${response.status}`,
      );
    }

    const memberData = await response.json();

    try {
      await redisClient.setex(cacheKey, cacheTTL, JSON.stringify(memberData));
    } catch (cacheError) {
      logger.warn('Failed to cache Discord user guild member data', {
        userDiscordId,
        guildId,
        error:
          cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }

    return memberData;
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

/**
 * Gets the highest role position for a user in a guild
 * @param userMember User's guild member info
 * @param guildRoles All roles in the guild
 * @returns Highest role position (0 if no roles)
 */
export function getUserHighestRolePosition(
  userMember: DiscordGuildMember,
  guildRoles: DiscordRole[],
): number {
  if (!userMember.roles.length) {
    return 0;
  }

  const userRoles = guildRoles.filter((role) =>
    userMember.roles.includes(role.id),
  );

  return Math.max(...userRoles.map((role) => role.position), 0);
}

/**
 * Gets the highest role position for the bot in a guild
 * @param botMember Bot's guild member info
 * @param guildRoles All roles in the guild
 * @returns Highest role position (0 if no roles)
 */
export function getBotHighestRolePosition(
  botMember: DiscordGuildMember,
  guildRoles: DiscordRole[],
): number {
  if (!botMember.roles.length) {
    return 0;
  }

  const botRoles = guildRoles.filter((role) =>
    botMember.roles.includes(role.id),
  );

  return Math.max(...botRoles.map((role) => role.position), 0);
}

/**
 * Fetches bot's member info for a specific guild to check permissions and role hierarchy
 * @param guildId Guild ID
 * @returns Bot's member info or null if not in guild
 * @throws Error if fetch fails (non-404 errors)
 */
export async function fetchBotGuildMember(
  guildId: string,
): Promise<DiscordGuildMember | null> {
  const cacheKey = `discord_bot_member:${guildId}`;
  const cacheTTL = 300; // 5 minutes (bot member data is relatively stable)

  try {
    // Try to get from cache first
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (cacheError) {
    logger.warn('Failed to read Discord bot guild member cache', {
      guildId,
      error:
        cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
  }

  try {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!;
    const { response } = await makeDiscordApiRequest(
      `https://discord.com/api/v10/guilds/${guildId}/members/${clientId}`,
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
      },
      3,
      `fetchBotGuildMember(${guildId})`,
    );

    if (response.status === 404) {
      // Cache the null result for a shorter time
      try {
        await redisClient.setex(cacheKey, 60, JSON.stringify(null));
      } catch (cacheError) {
        logger.warn('Failed to cache Discord bot guild member null result', {
          guildId,
          error:
            cacheError instanceof Error
              ? cacheError.message
              : String(cacheError),
        });
      }
      return null;
    }

    if (!response.ok) {
      let responseData;
      if (response.headers.get('content-type')?.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      logger.error('Failed to fetch Discord bot guild member', {
        guildId,
        status: response.status,
        error: responseData,
      });

      throw new Error(
        `Discord bot guild member fetch failed: ${response.status}`,
      );
    }

    const memberData = await response.json();

    // Cache the result
    try {
      await redisClient.setex(cacheKey, cacheTTL, JSON.stringify(memberData));
    } catch (cacheError) {
      logger.warn('Failed to cache Discord bot guild member data', {
        guildId,
        error:
          cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }

    return memberData;
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

export interface DiscordRoleMappingItem {
  discordRoleId: string;
  discordGuildId: string;
}

export interface ValidatedDiscordRoleMapping {
  discordRoleId: string;
  discordGuildId: string;
  roleName: string;
  guildName: string;
}

export interface DiscordValidationResult {
  success: boolean;
  validatedMappings?: ValidatedDiscordRoleMapping[];
  error?: string;
  errorCode?:
    | 'NO_DISCORD_ACCOUNT'
    | 'INVALID_TOKEN'
    | 'INSUFFICIENT_PERMISSIONS'
    | 'ROLE_NOT_FOUND'
    | 'GUILD_NOT_FOUND'
    | 'BOT_NOT_IN_GUILD'
    | 'DUPLICATE_MAPPING';
}

/**
 * Filters roles that both user and bot can assign to other users
 * A role can be assigned if:
 * 1. It's not managed by an integration
 * 2. It's lower than both the user's and bot's highest role position
 * 3. Both user and bot have MANAGE_ROLES permission
 * @param guildRoles All guild roles
 * @param userMember User's guild member info
 * @param botMember Bot's guild member info
 * @param userGuild User's guild info (for owner check)
 * @param botGuild Bot's guild info (for owner check)
 * @returns Array of roles that can be assigned
 */
export function getAssignableRoles(
  guildRoles: DiscordRole[],
  userMember: DiscordGuildMember,
  botMember: DiscordGuildMember,
  userGuild: DiscordGuild,
  botGuild: DiscordGuild,
): DiscordRole[] {
  // Validate input parameters
  if (!userGuild || !botGuild || !guildRoles || !userMember || !botMember) {
    logger.warn('Invalid parameters for getAssignableRoles', {
      guildId: userGuild?.id,
      hasUserGuild: !!userGuild,
      hasBotGuild: !!botGuild,
      hasGuildRoles: !!guildRoles,
      hasUserMember: !!userMember,
      hasBotMember: !!botMember,
    });
    return [];
  }

  // Validate permission strings
  if (
    !isValidPermissions(userGuild.permissions) ||
    !isValidPermissions(botGuild.permissions)
  ) {
    logger.warn('Invalid permission strings in getAssignableRoles', {
      guildId: userGuild.id,
      userPermissionsValid: isValidPermissions(userGuild.permissions),
      botPermissionsValid: isValidPermissions(botGuild.permissions),
    });
    return [];
  }

  // Check if both user and bot have manage roles permission
  const userHasPermission =
    userGuild.owner || hasManageRolesPermission(userGuild.permissions);
  const botHasPermission =
    botGuild.owner || hasManageRolesPermission(botGuild.permissions);

  if (!userHasPermission || !botHasPermission) {
    logger.info('Insufficient permissions for role assignment', {
      guildId: userGuild.id,
      guildName: userGuild.name,
      userHasPermission,
      botHasPermission,
      userPermissions: getUserPermissions(userGuild.permissions),
      botPermissions: getUserPermissions(botGuild.permissions),
    });
    return [];
  }

  const userHighestPosition = getUserHighestRolePosition(
    userMember,
    guildRoles,
  );
  const botHighestPosition = getBotHighestRolePosition(botMember, guildRoles);

  return guildRoles.filter((role) => {
    // Skip @everyone role
    if (role.name === '@everyone') {
      return false;
    }

    // Skip managed roles (bot roles, integrations, etc.)
    if (role.managed) {
      return false;
    }

    // Role must be lower than both user's and bot's highest role
    const rolePosition = role.position;
    const userCanAssign = userGuild.owner || rolePosition < userHighestPosition;
    const botCanAssign = botGuild.owner || rolePosition < botHighestPosition;

    return userCanAssign && botCanAssign;
  });
}

/**
 * Validates Discord role mappings for a user within their team context
 * Ensures that:
 * 1. User has a connected Discord account
 * 2. User and bot are in the specified guilds
 * 3. User and bot have proper permissions to manage the roles
 * 4. Roles exist and can be assigned
 * 5. No duplicate mappings
 * @param params Validation parameters
 * @returns Promise resolving to validation result
 */
export async function validateDiscordRoleMappingsForUser({
  roleMappings,
  userId,
  userDiscordAccount,
}: {
  roleMappings: DiscordRoleMappingItem[];
  userId: string;
  userDiscordAccount: { discordId: string; refreshToken: string };
}): Promise<DiscordValidationResult> {
  try {
    if (!roleMappings || roleMappings.length === 0) {
      return { success: true, validatedMappings: [] };
    }

    if (!userDiscordAccount.refreshToken) {
      return {
        success: false,
        error: 'Invalid Discord token',
        errorCode: 'INVALID_TOKEN',
      };
    }

    // Get Discord tokens
    const tokenResult = await getDiscordTokens(
      userDiscordAccount.refreshToken,
      userId,
    );

    if (!tokenResult) {
      return {
        success: false,
        error: 'Invalid or expired Discord token',
        errorCode: 'INVALID_TOKEN',
      };
    }

    // Check for duplicate mappings within this request
    const uniqueMappings = new Map<string, DiscordRoleMappingItem>();
    for (const mapping of roleMappings) {
      const key = `${mapping.discordGuildId}:${mapping.discordRoleId}`;
      if (uniqueMappings.has(key)) {
        return {
          success: false,
          error: 'Duplicate Discord role mapping detected',
          errorCode: 'DUPLICATE_MAPPING',
        };
      }
      uniqueMappings.set(key, mapping);
    }

    // Get unique guild IDs from all mappings
    const guildIds = [...new Set(roleMappings.map((m) => m.discordGuildId))];

    // Fetch user guilds and bot guilds
    const [userGuilds, botGuilds] = await Promise.all([
      fetchDiscordUserGuilds(
        tokenResult.accessToken,
        userDiscordAccount.discordId,
      ),
      fetchBotGuilds(),
    ]);

    const validatedMappings: ValidatedDiscordRoleMapping[] = [];

    // Validate each guild and its roles
    for (const guildId of guildIds) {
      // Find user's guild info
      const userGuild = userGuilds.find((g) => g.id === guildId);
      if (!userGuild) {
        return {
          success: false,
          error: `User is not a member of Discord server ${guildId}`,
          errorCode: 'GUILD_NOT_FOUND',
        };
      }

      // Find bot's guild info
      const botGuild = botGuilds.find((g) => g.id === guildId);
      if (!botGuild) {
        return {
          success: false,
          error: `Bot is not a member of Discord server ${guildId}`,
          errorCode: 'BOT_NOT_IN_GUILD',
        };
      }

      try {
        // Fetch detailed member info and guild roles
        const [guildRoles, userMember, botMember] = await Promise.all([
          fetchGuildRoles(guildId),
          fetchUserGuildMember(
            guildId,
            tokenResult.accessToken,
            userDiscordAccount.discordId,
          ),
          fetchBotGuildMember(guildId),
        ]);

        if (!userMember) {
          return {
            success: false,
            error: `User member data not found in Discord server ${userGuild.name}`,
            errorCode: 'GUILD_NOT_FOUND',
          };
        }

        if (!botMember) {
          return {
            success: false,
            error: `Bot member data not found in Discord server ${userGuild.name}`,
            errorCode: 'BOT_NOT_IN_GUILD',
          };
        }

        // Get roles that can be assigned by both user and bot
        const assignableRoles = getAssignableRoles(
          guildRoles,
          userMember,
          botMember,
          userGuild,
          botGuild,
        );

        // Validate each role mapping for this guild
        const guildMappings = roleMappings.filter(
          (m) => m.discordGuildId === guildId,
        );
        for (const mapping of guildMappings) {
          const role = assignableRoles.find(
            (r) => r.id === mapping.discordRoleId,
          );
          if (!role) {
            // Try to find the role in all guild roles to provide better error message
            const roleExists = guildRoles.find(
              (r) => r.id === mapping.discordRoleId,
            );
            if (!roleExists) {
              return {
                success: false,
                error: `Discord role ${mapping.discordRoleId} not found in server ${userGuild.name}`,
                errorCode: 'ROLE_NOT_FOUND',
              };
            } else {
              return {
                success: false,
                error: `Insufficient permissions to assign role "${roleExists.name}" in server ${userGuild.name}`,
                errorCode: 'INSUFFICIENT_PERMISSIONS',
              };
            }
          }

          validatedMappings.push({
            discordRoleId: mapping.discordRoleId,
            discordGuildId: mapping.discordGuildId,
            roleName: role.name,
            guildName: userGuild.name,
          });
        }
      } catch (error) {
        logger.error('Failed to validate Discord role mapping', {
          guildId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          success: false,
          error: `Failed to validate permissions in Discord server ${userGuild.name}`,
          errorCode: 'INSUFFICIENT_PERMISSIONS',
        };
      }
    }

    return {
      success: true,
      validatedMappings,
    };
  } catch (error) {
    logger.error('Discord role mapping validation failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: 'Failed to validate Discord role mappings',
      errorCode: 'INVALID_TOKEN',
    };
  }
}
