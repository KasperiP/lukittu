'use client';
import { IBlacklistGetSuccessResponse } from '@/app/api/(dashboard)/blacklist/route';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BlacklistModalContext } from '@/providers/BlacklistModalProvider';
import { VariantProps } from 'class-variance-authority';
import { Edit, Ellipsis, Trash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext } from 'react';

interface BlacklistActionDropdownProps {
  blacklist: IBlacklistGetSuccessResponse['blacklist'][number] | undefined;
  variant?: VariantProps<typeof buttonVariants>['variant'];
}

export const BlacklistActionDropdown = ({
  blacklist,
  variant = 'ghost',
}: BlacklistActionDropdownProps) => {
  const t = useTranslations();
  const ctx = useContext(BlacklistModalContext);

  if (!blacklist) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant={variant}>
          <Ellipsis className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="font-medium" forceMount>
        <DropdownMenuItem
          className="hover:cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            ctx.setBlacklistToEdit(blacklist);
            ctx.setBlacklistModalOpen(true);
          }}
        >
          <Edit className="mr-2 h-4 w-4" />
          {t('dashboard.blacklist.edit_blacklist')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-destructive hover:cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            ctx.setBlacklistToDelete(blacklist);
            ctx.setBlacklistToDeleteModalOpen(true);
          }}
        >
          <Trash className="mr-2 h-4 w-4" />
          {t('dashboard.blacklist.delete_blacklist')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
