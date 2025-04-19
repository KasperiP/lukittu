import { ITeamGetSuccessResponse } from '@/app/api/(dashboard)/teams/[slug]/route';
import LoadingButton from '@/components/shared/LoadingButton';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ResetPublicKeyConfirmModalProps {
  open: boolean;
  onOpenChange: (boolean: boolean) => void;
  team: ITeamGetSuccessResponse['team'] | null;
  onConfirm: () => Promise<void>;
}

export function ResetPublicKeyConfirmModal({
  open,
  onOpenChange,
  team,
  onConfirm,
}: ResetPublicKeyConfirmModalProps) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await onConfirm();
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
            {t('dashboard.settings.reset_public_key_confirm_title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('dashboard.settings.reset_public_key_confirm_description')}
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
            {t('dashboard.settings.reset_key')}
          </LoadingButton>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
