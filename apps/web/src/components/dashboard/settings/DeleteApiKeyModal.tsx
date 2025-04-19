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
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

interface DeleteApiKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string | null;
}

export function DeleteApiKeyModal({
  open,
  onOpenChange,
  apiKey,
}: DeleteApiKeyModalProps) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const { mutate } = useSWRConfig();

  if (!apiKey) return null;

  const handleDelete = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/teams/api-key/${apiKey}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      mutate((key) => Array.isArray(key) && key[0] === '/api/teams');
      toast.success(t('dashboard.settings.api_key_deleted'));
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.settings.delete_api_key_confirm_title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t.rich('dashboard.settings.delete_api_key_confirm_description', {
              id: apiKey,
              strong: (children) => <strong>{children}</strong>,
            })}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter>
          <LoadingButton
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('general.cancel')}
          </LoadingButton>
          <LoadingButton
            pending={loading}
            size="sm"
            variant="destructive"
            onClick={handleDelete}
          >
            {t('general.delete')}
          </LoadingButton>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
