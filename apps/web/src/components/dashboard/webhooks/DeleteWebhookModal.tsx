'use client';
import { IWebhookDeleteResponse } from '@/app/api/(dashboard)/webhooks/[slug]/route';
import LoadingButton from '@/components/shared/LoadingButton';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { WebhookModalContext } from '@/providers/WebhookModalProvider';
import { useTranslations } from 'next-intl';
import { useContext, useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export default function DeleteWebhookModal() {
  const t = useTranslations();
  const ctx = useContext(WebhookModalContext);
  const { mutate } = useSWRConfig();

  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!ctx.webhookToDelete) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/webhooks/${ctx.webhookToDelete.id}`, {
        method: 'DELETE',
      });

      const data = (await response.json()) as IWebhookDeleteResponse;

      if ('message' in data) {
        toast.error(data.message);
        return;
      }

      mutate((key) => Array.isArray(key) && key[0] === '/api/webhooks');

      handleOpenChange(false);
      toast.success(t('validation.webhook_deleted'));
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setWebhookDeleteModalOpen(open);
    if (!open) {
      ctx.setWebhookToDelete(null);
    }
  };

  return (
    <ResponsiveDialog
      open={ctx.webhookDeleteModalOpen}
      onOpenChange={handleOpenChange}
    >
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.webhooks.delete_webhook_confirm_title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t.rich('dashboard.webhooks.delete_webhook_confirm_description', {
              webhookName: ctx.webhookToDelete?.name?.toString() || '',
              strong: (children) => <strong>{children}</strong>,
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
            pending={deleting}
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
