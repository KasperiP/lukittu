/**
 * Generates Discord avatar URL from user ID and avatar hash
 * @param userId Discord user ID
 * @param avatarHash Discord avatar hash (can be null)
 * @param size Optional size parameter (default 128)
 * @returns Full avatar URL or null if no avatar
 */
export function getDiscordAvatarUrl(
  userId: string,
  avatarHash: string | null,
  size: number = 128,
): string | null {
  if (!avatarHash) {
    return null;
  }
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.webp?size=${size}`;
}
