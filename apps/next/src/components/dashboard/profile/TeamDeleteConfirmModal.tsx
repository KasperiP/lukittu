import LoadingButton from '@/components/shared/LoadingButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { Team } from '@lukittu/prisma';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface DeleteTeamConfirmModalProps {
  team: Team | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (team: Team, teamNameConfirmation: string) => Promise<void>;
  open: boolean;
}

export function DeleteTeamConfirmModal({
  team,
  onOpenChange,
  onConfirm,
  open,
}: DeleteTeamConfirmModalProps) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  if (!team) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await onConfirm(team, confirmName);
      onOpenChange(false);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    setConfirmName('');
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.profile.delete_team_confirm_title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t.rich('dashboard.profile.delete_team_confirm_description', {
              teamName: team.name,
              strong: (child) => <strong>{child}</strong>,
            })}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form
          className="grid w-full gap-1.5 max-md:px-2"
          onSubmit={handleConfirm}
        >
          <Label htmlFor="confirmName">
            {t.rich('dashboard.profile.delete_team_confirm_input', {
              teamName: `"${team.name.toUpperCase()}"`,
              code: (child) => (
                <code className="text-xs font-semibold">{child}</code>
              ),
            })}
          </Label>
          <Input
            id="confirmName"
            onChange={(e) => setConfirmName(e.target.value)}
          />
          <input className="hidden" type="submit" />
        </form>
        <ResponsiveDialogFooter>
          <LoadingButton
            size="sm"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t('general.cancel')}
          </LoadingButton>
          <LoadingButton
            disabled={confirmName !== team.name.toUpperCase()}
            pending={loading}
            size="sm"
            variant="destructive"
            onClick={handleConfirm}
          >
            {t('dashboard.profile.delete_team')}
          </LoadingButton>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
