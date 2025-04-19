import { IBlacklistDeleteResponse } from '@/app/api/(dashboard)/blacklist/[slug]/route';
import LoadingButton from '@/components/shared/LoadingButton';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { BlacklistModalContext } from '@/providers/BlacklistModalProvider';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useContext, useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export function DeleteBlacklistConfirmModal() {
  const t = useTranslations();
  const ctx = useContext(BlacklistModalContext);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const pathname = usePathname();

  const blacklist = ctx.blacklistToDelete;

  if (!blacklist) return null;

  const handleDeleteBlacklist = async (blacklistId: string) => {
    const response = await fetch(`/api/blacklist/${blacklistId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = (await response.json()) as IBlacklistDeleteResponse;

    return data;
  };

  const onSubmit = async () => {
    setLoading(true);
    try {
      const res = await handleDeleteBlacklist(blacklist.id);

      if ('message' in res) {
        toast.error(res.message);
      } else {
        toast.success(t('dashboard.blacklist.blacklist_deleted'));

        if (pathname.includes('/dashboard/blacklist/')) {
          router.push('/dashboard/blacklist');
        }
      }

      mutate((key) => Array.isArray(key) && key[0] === '/api/blacklist');
      ctx.setBlacklistToDelete(null);
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setBlacklistToDeleteModalOpen(open);
  };

  return (
    <>
      <ResponsiveDialog
        open={ctx.blacklistToDeleteModalOpen}
        onOpenChange={handleOpenChange}
      >
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t('dashboard.blacklist.delete_blacklist_confirm_title')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t.rich(
                'dashboard.blacklist.delete_blacklist_confirm_description',
                {
                  value: blacklist.country ?? blacklist.value,
                  strong: (child) => <strong>{child}</strong>,
                },
              )}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <LoadingButton
              size="sm"
              variant="outline"
              onClick={() => {
                handleOpenChange(false);
                ctx.setBlacklistToDelete(null);
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
              {t('dashboard.blacklist.delete_blacklist')}
            </LoadingButton>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
