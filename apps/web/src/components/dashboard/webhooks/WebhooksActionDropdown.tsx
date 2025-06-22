'use client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WebhookModalContext } from '@/providers/WebhookModalProvider';
import { Webhook } from '@lukittu/shared';
import { Edit, MoreHorizontal, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext } from 'react';

interface WebhooksActionDropdownProps {
  webhook: Webhook;
}

export function WebhooksActionDropdown({
  webhook,
}: WebhooksActionDropdownProps) {
  const t = useTranslations();
  const webhookModalCtx = useContext(WebhookModalContext);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-8 w-8 p-0"
          size="sm"
          variant="ghost"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="hover:cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            webhookModalCtx.setWebhookToEdit(webhook);
            webhookModalCtx.setWebhookModalOpen(true);
          }}
        >
          <Edit className="mr-2 h-4 w-4" />
          {t('general.edit')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive hover:cursor-pointer focus:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            webhookModalCtx.setWebhookToDelete(webhook);
            webhookModalCtx.setWebhookDeleteModalOpen(true);
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t('general.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
