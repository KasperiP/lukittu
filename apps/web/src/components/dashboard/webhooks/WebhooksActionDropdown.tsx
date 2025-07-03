'use client';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WebhookModalContext } from '@/providers/WebhookModalProvider';
import { Webhook } from '@lukittu/shared';
import { VariantProps } from 'class-variance-authority';
import { Edit, MoreHorizontal, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext } from 'react';

interface WebhooksActionDropdownProps {
  webhook: Webhook;
  variant?: VariantProps<typeof buttonVariants>['variant'];
}

export function WebhooksActionDropdown({
  webhook,
  variant = 'ghost',
}: WebhooksActionDropdownProps) {
  const t = useTranslations();
  const webhookModalCtx = useContext(WebhookModalContext);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant={variant}>
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
