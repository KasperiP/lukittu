'use client';
import { ILicenseGetSuccessResponse } from '@/app/api/(dashboard)/licenses/[slug]/route';
import { ProductsMultiselect } from '@/components/shared/form/ProductsMultiselect';
import LoadingButton from '@/components/shared/LoadingButton';
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
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { Product } from '@lukittu/prisma';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface LicenseProductsModalProps {
  license: ILicenseGetSuccessResponse['license'] | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProducts?: Product[];
  onSubmit: (productIds: string[]) => Promise<void>;
}

export const LicenseProductsModal = ({
  open,
  onOpenChange,
  selectedProducts,
  onSubmit,
  license,
}: LicenseProductsModalProps) => {
  const t = useTranslations();
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    selectedProducts?.map((p) => p.id) ?? [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [pendingProductIds, setPendingProductIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedProductIds(selectedProducts?.map((p) => p.id) ?? []);
  }, [selectedProducts]);

  const handleProductChange = (productIds: string[], isClear?: boolean) => {
    if (isClear && selectedProductIds.length > 0) {
      setShowRemoveConfirm(true);
      setPendingProductIds([]);
      return;
    }

    const hasRemovals = productIds.length < selectedProductIds.length;
    if (hasRemovals) {
      setShowRemoveConfirm(true);
      setPendingProductIds(productIds);
    } else {
      setSelectedProductIds(productIds);
    }
  };

  const handleRemoveConfirm = () => {
    setSelectedProductIds(pendingProductIds);
    setShowRemoveConfirm(false);
    setPendingProductIds([]);
  };

  const handleRemoveCancel = () => {
    setShowRemoveConfirm(false);
    setPendingProductIds([]);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(selectedProductIds);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!license) return null;

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t('general.select_products')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t.rich('dashboard.products.editing_products_of_license', {
                strong: (children) => <strong>{children}</strong>,
                license: license.licenseKey,
              })}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="space-y-4">
            <ProductsMultiselect
              selectedProducts={selectedProducts}
              value={selectedProductIds}
              onChange={handleProductChange}
            />
          </div>
          <div className="flex justify-end space-x-2">
            <LoadingButton
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('general.cancel')}
            </LoadingButton>
            <LoadingButton pending={submitting} onClick={handleSubmit}>
              {t('general.save')}
            </LoadingButton>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <AlertDialog open={showRemoveConfirm} onOpenChange={handleRemoveCancel}>
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
            <AlertDialogCancel>{t('general.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveConfirm}>
              {t('general.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
