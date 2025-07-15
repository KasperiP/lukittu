import { Team } from '../../../../prisma/generated/client';

export interface FormatAuthorParams {
  team: Team;
}

export const formatDiscordAuthor = ({ team }: FormatAuthorParams) => ({
  name: team.name || 'Unknown Team',
  icon_url: team.imageUrl || undefined,
});
