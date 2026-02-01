'use client';
import { IProductsBranchesGetSuccessResponse } from '@/app/api/(dashboard)/products/branches/route';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BranchModalContext } from '@/providers/BranchModalProvider';
import { VariantProps } from 'class-variance-authority';
import { Copy, Edit, Ellipsis, Trash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext } from 'react';
import { toast } from 'sonner';

interface BranchActionDropdownProps {
  branch: IProductsBranchesGetSuccessResponse['branches'][number] | undefined;
  variant?: VariantProps<typeof buttonVariants>['variant'];
}

export const BranchActionDropdown = ({
  branch,
  variant = 'ghost',
}: BranchActionDropdownProps) => {
  const t = useTranslations();
  const ctx = useContext(BranchModalContext);

  if (!branch) return null;

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
            navigator.clipboard.writeText(branch.id);
            toast.success(t('general.copied_to_clipboard'));
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          {t('general.copy_id')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="hover:cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            ctx.setBranchToEdit(branch);
            ctx.setBranchModalOpen(true);
          }}
        >
          <Edit className="mr-2 h-4 w-4" />
          {t('dashboard.releases.update_branch')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-destructive hover:cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            ctx.setBranchToDelete(branch);
            ctx.setBranchDeleteModalOpen(true);
          }}
        >
          <Trash className="mr-2 h-4 w-4" />
          {t('dashboard.releases.delete_branch')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
