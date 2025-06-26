'use client';
import { IWebhookDeleteResponse } from '@/app/api/(dashboard)/webhooks/[slug]/route';
import LoadingButton from '@/components/shared/LoadingButton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
      toast.success('Webhook deleted successfully');
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
    <AlertDialog
      open={ctx.webhookDeleteModalOpen}
      onOpenChange={handleOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('dashboard.webhooks.delete_webhook_confirm_title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t.rich('dashboard.webhooks.delete_webhook_confirm_description', {
              webhookName: ctx.webhookToDelete?.name,
              strong: (children) => <strong>{children}</strong>,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <LoadingButton
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t('general.cancel')}
          </LoadingButton>
          <LoadingButton
            pending={deleting}
            variant="destructive"
            onClick={handleDelete}
          >
            {t('general.delete')}
          </LoadingButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
