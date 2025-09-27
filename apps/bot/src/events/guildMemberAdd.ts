import { logger } from '@lukittu/shared';
import { Events, GuildMember } from 'discord.js';
import { processUserJoin } from '../services/discord-role-service';

export const event = {
  name: Events.GuildMemberAdd,
  once: false,
  execute: async (member: GuildMember) => {
    try {
      await processUserJoin(member);
    } catch (error) {
      logger.error('Failed to process guild member join', {
        userId: member.user.id,
        guildId: member.guild.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
