'use client';
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
import { BranchModalContext } from '@/providers/BranchModalProvider';
import { useTranslations } from 'next-intl';
import { useContext, useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export function BranchDeleteConfirmModal() {
  const t = useTranslations();
  const ctx = useContext(BranchModalContext);
  const [loading, setLoading] = useState(false);
  const { mutate } = useSWRConfig();

  const branch = ctx.branchToDelete;

  if (!branch) return null;

  const handleDeleteBranch = async (branchId: string) => {
    const response = await fetch(`/api/products/branches/${branchId}`, {
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
      const res = await handleDeleteBranch(branch.id);

      if ('message' in res) {
        toast.error(res.message);
      } else {
        toast.success(t('dashboard.releases.branch_deleted'));
      }

      mutate(
        (key) =>
          Array.isArray(key) &&
          ['/api/products/releases', '/api/products/branches'].includes(key[0]),
      );
      ctx.setBranchToDelete(null);
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setBranchDeleteModalOpen(open);
  };

  return (
    <ResponsiveDialog
      open={ctx.branchDeleteModalOpen}
      onOpenChange={handleOpenChange}
    >
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.releases.delete_branch_confirm_title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t.rich('dashboard.releases.delete_branch_confirm_description', {
              name: branch.name,
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
              ctx.setBranchToDelete(null);
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
            {t('dashboard.releases.delete_branch')}
          </LoadingButton>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
