import { ITeamsGetSuccessResponse } from '@/app/api/(dashboard)/teams/route';
import LoadingButton from '@/components/shared/LoadingButton';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Team } from '@lukittu/prisma';
import { ChevronsUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TransferTeamOwnershipModalProps {
  team: ITeamsGetSuccessResponse['teams'][number] | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  onConfirm: (team: Team, newOwnerId: string) => Promise<void>;
}

export function TransferTeamOwnershipModal({
  team,
  onOpenChange,
  open,
  onConfirm,
}: TransferTeamOwnershipModalProps) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [newOwner, setNewOwner] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (!team) return null;

  const handleConfirm = async () => {
    if (!newOwner) return;
    setLoading(true);
    try {
      await onConfirm(team, newOwner);
      onOpenChange(false);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    setNewOwner(null);
    setPopoverOpen(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.profile.transfer_ownership_title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t.rich('dashboard.profile.transfer_ownership_description', {
              teamName: team.name,
              strong: (child) => <strong>{child}</strong>,
            })}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="max-md:px-2">
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                aria-expanded={popoverOpen}
                className="w-full justify-between"
                role="combobox"
                variant="outline"
              >
                {newOwner
                  ? team.users.find((user) => user.id === newOwner)?.fullName
                  : t('dashboard.profile.select_new_owner')}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="popover-content-width-full w-full p-0">
              <Command
                filter={(value, search) => {
                  const item = team.users.find((user) => user.id === value);
                  return item?.fullName
                    .toLowerCase()
                    .includes(search.toLowerCase())
                    ? 1
                    : 0;
                }}
              >
                <CommandInput placeholder={t('general.search_user')} />
                <CommandList>
                  <CommandEmpty className="px-4 py-4 text-sm">
                    {t('dashboard.profile.no_users_found')}
                  </CommandEmpty>
                  <CommandGroup>
                    <ScrollArea className="flex max-h-40 flex-col overflow-y-auto">
                      {team.users
                        .filter((user) => user.id !== team.ownerId)
                        .map((user) => (
                          <CommandItem
                            key={user.id.toString()}
                            value={user.id.toString()}
                            onSelect={() => {
                              setNewOwner(user.id);
                              setPopoverOpen(false);
                            }}
                          >
                            {user.fullName}
                          </CommandItem>
                        ))}
                    </ScrollArea>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <ResponsiveDialogFooter>
          <LoadingButton
            size="sm"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t('general.cancel')}
          </LoadingButton>
          <LoadingButton
            disabled={!newOwner}
            pending={loading}
            size="sm"
            variant="destructive"
            onClick={handleConfirm}
          >
            {t('dashboard.profile.transfer_ownership')}
          </LoadingButton>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
