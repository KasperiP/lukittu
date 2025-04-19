import LoadingButton from '@/components/shared/LoadingButton';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { Team } from '@lukittu/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface LeaveTeamConfirmModalProps {
  team: Team | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  onConfirm: (team: Team) => Promise<void>;
}

export function LeaveTeamConfirmModal({
  team,
  onOpenChange,
  open,
  onConfirm,
}: LeaveTeamConfirmModalProps) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);

  if (!team) return null;

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await onConfirm(team);
      onOpenChange(false);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.profile.team_leave_confirm_title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t.rich('dashboard.profile.team_leave_confirm_description', {
              teamName: team.name,
              strong: (child) => <strong>{child}</strong>,
            })}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter>
          <LoadingButton
            size="sm"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t('general.cancel')}
          </LoadingButton>
          <LoadingButton
            pending={loading}
            size="sm"
            variant="destructive"
            onClick={handleConfirm}
          >
            {t('dashboard.profile.leave_team')}
          </LoadingButton>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
