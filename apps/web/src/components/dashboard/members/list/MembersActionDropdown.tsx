'use client';
import { ITeamsMembersGetSuccessResponse } from '@/app/api/(dashboard)/teams/members/route';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MemberModalContext } from '@/providers/MemberModalProvider';
import { Copy, Ellipsis, Trash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext } from 'react';
import { toast } from 'sonner';

interface MembersDropdownProps {
  member: ITeamsMembersGetSuccessResponse['members'][number] | undefined;
  isTeamOwner: boolean;
  isSelf: boolean;
}

export const MembersActionDropdown = ({
  member,
  isTeamOwner,
  isSelf,
}: MembersDropdownProps) => {
  const ctx = useContext(MemberModalContext);
  const t = useTranslations();

  if (!member) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {!isTeamOwner ? (
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <span>
                  <Button disabled={!isTeamOwner} size="icon" variant="ghost">
                    <Ellipsis className="h-4 w-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {t('dashboard.members.only_for_owners')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button disabled={isSelf} size="icon" variant="ghost">
            <Ellipsis className="h-4 w-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="font-medium" forceMount>
        <DropdownMenuItem
          className="hover:cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(member.id);
            toast.success(t('general.copied_to_clipboard'));
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          {t('general.copy_id')}
        </DropdownMenuItem>
        {!('isInvitation' in member) && (
          <DropdownMenuItem
            className="text-destructive hover:cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              ctx.setMemberToKick(member);
              ctx.setMemberToKickModalOpen(true);
            }}
          >
            <Trash className="mr-2 h-4 w-4" />
            {t('dashboard.members.kick_member')}
          </DropdownMenuItem>
        )}
        {'isInvitation' in member && (
          <DropdownMenuItem
            className="text-destructive hover:cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              ctx.setMemberToCancelInvitation(member);
              ctx.setMemberToCancelInvitationModalOpen(true);
            }}
          >
            <Trash className="mr-2 h-4 w-4" />
            {t('dashboard.members.cancel_invitation')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
