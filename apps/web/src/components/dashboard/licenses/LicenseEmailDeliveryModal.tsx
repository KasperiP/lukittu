'use client';

import { ILicenseEmailDeliveryResponse } from '@/app/api/(dashboard)/licenses/[slug]/email-delivery/route';
import LoadingButton from '@/components/shared/LoadingButton';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { LicenseModalContext } from '@/providers/LicenseModalProvider';
import { Check, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useState } from 'react';
import { toast } from 'sonner';

export function LicenseEmailDeliveryModal() {
  const t = useTranslations();
  const ctx = useContext(LicenseModalContext);
  const [loading, setLoading] = useState(false);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);

  const license = ctx.licenseEmailDelivery;

  if (!license) return null;

  const handleLicenseDelivery = async (
    licenseId: string,
    customerIds: string[],
  ) => {
    const response = await fetch(`/api/licenses/${licenseId}/email-delivery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customerIds }),
    });

    const data = (await response.json()) as ILicenseEmailDeliveryResponse;

    return data;
  };

  const onSubmit = async () => {
    if (selectedCustomers.length === 0) {
      toast.error(t('general.error_occurred'));
      return;
    }

    setLoading(true);
    try {
      const res = await handleLicenseDelivery(license.id, selectedCustomers);

      if ('message' in res) {
        toast.error(res.message);
      } else {
        toast.success(t('dashboard.licenses.emails_delivered'));
      }

      ctx.setLicenseEmailDelivery(null);
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setLicenseEmailDeliveryModalOpen(open);
    setSelectedCustomers([]);
  };

  const handleCustomerToggle = (customerId: string) => {
    setSelectedCustomers((prev) =>
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
        : [...prev, customerId],
    );
  };

  return (
    <ResponsiveDialog
      open={ctx.licenseEmailDeliveryModalOpen}
      onOpenChange={handleOpenChange}
    >
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.licenses.email_delivery_confirm_title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('dashboard.licenses.email_delivery_confirm_description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="space-y-2 max-md:px-2">
          <h2 className="text-sm font-semibold">
            {t('dashboard.navigation.customers')}
          </h2>
          {license.customers.map((customer) => (
            <Card
              key={customer.id}
              className="cursor-pointer"
              role="button"
              onClick={() => handleCustomerToggle(customer.id)}
            >
              <CardContent className="flex items-center px-4 py-2">
                <div className="flex flex-1 items-center">
                  <Checkbox
                    checked={selectedCustomers.includes(customer.id)}
                    className="mr-4"
                    id={`customer-${customer.id}`}
                    onCheckedChange={() => handleCustomerToggle(customer.id)}
                  />
                  <div className="grid">
                    <h2 className="truncate font-semibold">
                      {customer.fullName ?? t('general.unknown')}
                    </h2>
                    <p className="truncate text-sm text-muted-foreground">
                      {customer.email ?? t('general.unknown')}
                    </p>
                  </div>
                </div>
                <div>
                  {customer.email ? (
                    <Check className="h-6 w-6 text-green-500" />
                  ) : (
                    <TriangleAlert className="h-6 w-6 text-yellow-500" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <ResponsiveDialogFooter>
          <LoadingButton
            size="sm"
            variant="outline"
            onClick={() => {
              handleOpenChange(false);
              ctx.setLicenseEmailDelivery(null);
            }}
          >
            {t('general.cancel')}
          </LoadingButton>
          <LoadingButton
            disabled={selectedCustomers.length === 0}
            pending={loading}
            size="sm"
            onClick={onSubmit}
          >
            {t('dashboard.licenses.send_email_delivery')}
          </LoadingButton>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
