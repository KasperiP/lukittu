'use client';
import { ILicenseGetSuccessResponse } from '@/app/api/(dashboard)/licenses/[slug]/route';
import { IProductsGetSuccessResponse } from '@/app/api/(dashboard)/products/route';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProductModalContext } from '@/providers/ProductModalProvider';
import { VariantProps } from 'class-variance-authority';
import { Edit, Ellipsis, Trash, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useState } from 'react';

interface ProductsActionDropdownProps {
  product: IProductsGetSuccessResponse['products'][number] | undefined;
  license?: ILicenseGetSuccessResponse['license'] | undefined;
  handleLicenseProductsSet?: (productIds: string[]) => Promise<void>;
  variant?: VariantProps<typeof buttonVariants>['variant'];
}

export const ProductsActionDropdown = ({
  product,
  variant = 'ghost',
  handleLicenseProductsSet,
  license,
}: ProductsActionDropdownProps) => {
  const t = useTranslations();
  const ctx = useContext(ProductModalContext);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const handleProductRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!license || !handleLicenseProductsSet) return;

    try {
      await handleLicenseProductsSet(
        license.products.filter((p) => p.id !== product?.id).map((p) => p.id),
      );
    } finally {
      setShowRemoveConfirm(false);
    }
  };

  if (!product) return null;

  return (
    <>
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
              ctx.setProductToEdit(product);
              ctx.setProductModalOpen(true);
            }}
          >
            <Edit className="mr-2 h-4 w-4" />
            {t('dashboard.products.edit_product')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {Boolean(license && handleLicenseProductsSet) && (
            <DropdownMenuItem
              className="text-destructive hover:cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setShowRemoveConfirm(true);
              }}
            >
              <X className="mr-2 h-4 w-4" />
              {t('dashboard.licenses.remove_product')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-destructive hover:cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              ctx.setProductToDelete(product);
              ctx.setProductToDeleteModalOpen(true);
            }}
          >
            <Trash className="mr-2 h-4 w-4" />
            {t('dashboard.products.delete_product')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('dashboard.licenses.remove_product')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('dashboard.licenses.remove_product_warning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={(e) => {
                e.stopPropagation();
                setShowRemoveConfirm(false);
              }}
            >
              {t('general.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleProductRemove}>
              {t('general.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
