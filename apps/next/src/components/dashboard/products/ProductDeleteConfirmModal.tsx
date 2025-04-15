import { IProductsDeleteResponse } from '@/app/api/(dashboard)/products/[slug]/route';
import LoadingButton from '@/components/shared/LoadingButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { ProductModalContext } from '@/providers/ProductModalProvider';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useContext, useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export function DeleteProductConfirmModal() {
  const t = useTranslations();
  const ctx = useContext(ProductModalContext);
  const [loading, setLoading] = useState(false);
  const [productNameConfirmation, setProductNameConfirmation] = useState('');
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const pathname = usePathname();

  const product = ctx.productToDelete;

  if (!product) return null;

  const handleDeleteProduct = async (productId: string) => {
    const response = await fetch(`/api/products/${productId}`, {
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
      const res = await handleDeleteProduct(product.id);

      if ('message' in res) {
        toast.error(res.message);
      } else {
        toast.success(t('dashboard.products.product_deleted'));

        if (pathname.includes('/dashboard/products/')) {
          router.push('/dashboard/products');
        }
      }

      mutate((key) => Array.isArray(key) && key[0] === '/api/products');
      ctx.setProductToDelete(null);
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setProductToDeleteModalOpen(open);
    setProductNameConfirmation('');
  };

  return (
    <>
      <ResponsiveDialog
        open={ctx.productToDeleteModalOpen}
        onOpenChange={handleOpenChange}
      >
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t('dashboard.products.delete_product_confirm_title')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t.rich('dashboard.products.delete_product_confirm_description', {
                productName: product.name,
                strong: (child) => <strong>{child}</strong>,
              })}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="grid w-full gap-1.5 max-md:px-2">
            <Label htmlFor="productNameConfirmation">
              {t.rich('dashboard.products.delete_product_confirm_input', {
                productName: `"${product.name.toUpperCase()}"`,
                code: (child) => (
                  <code className="text-xs font-semibold">{child}</code>
                ),
              })}
            </Label>
            <Input
              id="productNameConfirmation"
              onChange={(e) => setProductNameConfirmation(e.target.value)}
            />
          </div>
          <ResponsiveDialogFooter>
            <LoadingButton
              size="sm"
              variant="outline"
              onClick={() => {
                handleOpenChange(false);
                ctx.setProductToDelete(null);
              }}
            >
              {t('general.cancel')}
            </LoadingButton>
            <LoadingButton
              disabled={productNameConfirmation !== product.name.toUpperCase()}
              pending={loading}
              size="sm"
              variant="destructive"
              onClick={onSubmit}
            >
              {t('dashboard.products.delete_product')}
            </LoadingButton>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
