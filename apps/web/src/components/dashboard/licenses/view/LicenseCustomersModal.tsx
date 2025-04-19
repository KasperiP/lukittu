'use client';
import { ILicenseGetSuccessResponse } from '@/app/api/(dashboard)/licenses/[slug]/route';
import { CustomersMultiselect } from '@/components/shared/form/CustomersMultiselect';
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
import { Customer } from '@lukittu/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface LicenseCustomersModalProps {
  license: ILicenseGetSuccessResponse['license'] | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCustomers?: Customer[];
  onSubmit: (customerIds: string[]) => Promise<void>;
}

export const LicenseCustomersModal = ({
  open,
  onOpenChange,
  selectedCustomers,
  onSubmit,
  license,
}: LicenseCustomersModalProps) => {
  const t = useTranslations();
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>(
    selectedCustomers?.map((c) => c.id) ?? [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [pendingCustomerIds, setPendingCustomerIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedCustomerIds(selectedCustomers?.map((c) => c.id) ?? []);
  }, [selectedCustomers]);

  const handleCustomerChange = (customerIds: string[], isClear?: boolean) => {
    if (isClear && selectedCustomerIds.length > 0) {
      setShowRemoveConfirm(true);
      setPendingCustomerIds([]);
      return;
    }

    const hasRemovals = customerIds.length < selectedCustomerIds.length;
    if (hasRemovals) {
      setShowRemoveConfirm(true);
      setPendingCustomerIds(customerIds);
    } else {
      setSelectedCustomerIds(customerIds);
    }
  };

  const handleRemoveConfirm = () => {
    setSelectedCustomerIds(pendingCustomerIds);
    setShowRemoveConfirm(false);
    setPendingCustomerIds([]);
  };

  const handleRemoveCancel = () => {
    setShowRemoveConfirm(false);
    setPendingCustomerIds([]);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(selectedCustomerIds);
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
              {t('general.select_customers')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t.rich('dashboard.customers.editing_customers_of_license', {
                strong: (children) => <strong>{children}</strong>,
                license: license.licenseKey,
              })}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="space-y-4">
            <CustomersMultiselect
              selectedCustomers={selectedCustomers}
              value={selectedCustomerIds}
              onChange={handleCustomerChange}
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
              {t('dashboard.licenses.remove_customer')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('dashboard.licenses.remove_customer_warning')}
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
