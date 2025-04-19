import { IProductsDeleteResponse } from '@/app/api/(dashboard)/products/[slug]/route';
import LoadingButton from '@/components/shared/LoadingButton';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { LicenseModalContext } from '@/providers/LicenseModalProvider';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useContext, useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export function DeleteLicenseConfirmModal() {
  const t = useTranslations();
  const ctx = useContext(LicenseModalContext);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { mutate } = useSWRConfig();

  const license = ctx.licenseToDelete;

  if (!license) return null;

  const handleDeleteLicense = async (licenseId: string) => {
    const response = await fetch(`/api/licenses/${licenseId}`, {
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
      const res = await handleDeleteLicense(license.id);

      if ('message' in res) {
        toast.error(res.message);
      } else {
        toast.success(t('dashboard.licenses.license_deleted'));

        if (pathname.includes('/dashboard/licenses/')) {
          router.push('/dashboard/licenses');
        }
      }

      mutate((key) => Array.isArray(key) && key[0] === '/api/licenses');
      ctx.setLicenseToDelete(null);
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setLicenseToDeleteModalOpen(open);
  };

  return (
    <>
      <ResponsiveDialog
        open={ctx.licenseToDeleteModalOpen}
        onOpenChange={handleOpenChange}
      >
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t('dashboard.licenses.delete_license_confirm_title')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t.rich('dashboard.licenses.delete_license_confirm_description', {
                license: license.licenseKey,
                strong: (child) => <strong>{child}</strong>,
              })}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <LoadingButton
              size="sm"
              variant="outline"
              onClick={() => {
                handleOpenChange(false);
                ctx.setLicenseToDelete(null);
              }}
            >
              {t('general.cancel')}
            </LoadingButton>
            <LoadingButton
              pending={loading}
              size="sm"
              variant="destructive"
              onClick={onSubmit}
            >
              {t('dashboard.licenses.delete_license')}
            </LoadingButton>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
