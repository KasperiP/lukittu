import { DiscordIcon } from '@/components/shared/Icons';
import { ClickableIdentifier } from '@/components/shared/misc/ClickableIdentifier';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getDiscordAvatarUrl } from '@/lib/utils/discord-helpers';
import { cn } from '@/lib/utils/tailwind-helpers';

interface DiscordAccountDisplayProps {
  discordAccount: {
    discordId: string;
    username: string;
    avatar: string | null;
    globalName?: string | null;
  };
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function DiscordAccountDisplay({
  discordAccount,
  size = 'md',
  className,
}: DiscordAccountDisplayProps) {
  const displayName = discordAccount.globalName || discordAccount.username;

  const avatarSizes = {
    sm: 'h-8 w-8',
    md: 'h-9 w-9',
    lg: 'h-12 w-12',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Avatar className={avatarSizes[size]}>
        <AvatarImage
          src={
            getDiscordAvatarUrl(
              discordAccount.discordId,
              discordAccount.avatar,
            ) ?? undefined
          }
        />
        <AvatarFallback className="bg-[#5865F2] text-white">
          <DiscordIcon className={iconSizes[size]} />
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <p className="truncate font-medium">{displayName}</p>

          <Badge className="w-fit flex-shrink-0 text-xs" variant="secondary">
            @{discordAccount.username}
          </Badge>
        </div>

        <ClickableIdentifier
          className={cn(
            'mt-1 text-sm text-muted-foreground',
            size === 'sm' && 'text-xs',
          )}
          value={discordAccount.discordId}
        >
          {discordAccount.discordId}
        </ClickableIdentifier>
      </div>
    </div>
  );
}
