import { IProductsDeleteResponse } from '@/app/api/(dashboard)/products/[slug]/route';
import LoadingButton from '@/components/shared/LoadingButton';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { ReleaseModalContext } from '@/providers/ReleasesModalProvider';
import { useTranslations } from 'next-intl';
import { useContext, useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export function DeleteDeleteConfirmModal() {
  const t = useTranslations();
  const ctx = useContext(ReleaseModalContext);
  const [loading, setLoading] = useState(false);
  const { mutate } = useSWRConfig();

  const release = ctx.releaseToDelete;

  if (!release) return null;

  const handleDeleteRelease = async (releaseId: string) => {
    const response = await fetch(`/api/products/releases/${releaseId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = (await response.json()) as IProductsDeleteResponse;

    return data;
  };

  const onSubmit = async () => {
    setLoading(true);
    try {
      const res = await handleDeleteRelease(release.id);

      if ('message' in res) {
        toast.error(res.message);
      } else {
        toast.success(t('dashboard.releases.release_deleted'));
      }

      mutate(
        (key) => Array.isArray(key) && key[0] === '/api/products/releases',
      );
      ctx.setReleaseToDelete(null);
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setReleaseToDeleteModalOpen(open);
  };

  return (
    <>
      <ResponsiveDialog
        open={ctx.releaseToDeleteModalOpen}
        onOpenChange={handleOpenChange}
      >
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t('dashboard.releases.delete_release_confirm_title')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t.rich('dashboard.releases.delete_release_confirm_description', {
                version: release.version,
                strong: (child) => <strong>{child}</strong>,
              })}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <LoadingButton
              size="sm"
              variant="outline"
              onClick={() => {
                handleOpenChange(false);
                ctx.setReleaseToDelete(null);
              }}
            >
              {t('general.cancel')}
            </LoadingButton>
            <LoadingButton
              pending={loading}
              size="sm"
              variant="destructive"
              onClick={onSubmit}
            >
              {t('dashboard.releases.delete_release')}
            </LoadingButton>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
