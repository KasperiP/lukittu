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

    const response = await fetch(
      `https://discord.com/api/v10/users/${discordId}`,
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
      },
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
  if (cacheKey) {
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
  }

  const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

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

  // Cache the result if userId is provided
  if (cacheKey) {
    try {
      await redisClient.setex(cacheKey, cacheTTL, JSON.stringify(guildsData));
    } catch (cacheError) {
      logger.warn('Failed to cache Discord user guilds data', {
        userDiscordId,
        error:
          cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }
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

  const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    },
  });

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
 * Checks if a permission number includes MANAGE_ROLES permission (0x10000000)
 * @param permissions Permission bitfield as string
 * @returns True if has manage roles permission
 */
export function hasManageRolesPermission(permissions: string): boolean {
  const MANAGE_ROLES = 0x10000000;
  const permissionBits = BigInt(permissions);
  return (permissionBits & BigInt(MANAGE_ROLES)) === BigInt(MANAGE_ROLES);
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

  const response = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/roles`,
    {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
    },
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
  if (cacheKey) {
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
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (response.status === 404) {
      // Cache the null result for a shorter time
      if (cacheKey) {
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

    // Cache the result if userId is provided
    if (cacheKey) {
      try {
        await redisClient.setex(cacheKey, cacheTTL, JSON.stringify(memberData));
      } catch (cacheError) {
        logger.warn('Failed to cache Discord user guild member data', {
          userDiscordId,
          guildId,
          error:
            cacheError instanceof Error
              ? cacheError.message
              : String(cacheError),
        });
      }
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
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${clientId}`,
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
      },
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
  // Check if both user and bot have manage roles permission
  const userHasPermission =
    userGuild.owner || hasManageRolesPermission(userGuild.permissions);
  const botHasPermission =
    botGuild.owner || hasManageRolesPermission(botGuild.permissions);

  if (!userHasPermission || !botHasPermission) {
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
