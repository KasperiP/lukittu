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
      logger.error(
        `Error processing guild member join for user ${member.user.id} in guild ${member.guild.id}:`,
        error,
      );
    }
  },
};
