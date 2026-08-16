'use client';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LicenseModalContext } from '@/providers/LicenseModalProvider';
import { Customer, License, Metadata, Product } from '@lukittu/shared';
import { VariantProps } from 'class-variance-authority';
import { Copy, Edit, Ellipsis, Send, Trash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext } from 'react';
import { copyToClipboard } from '@/lib/utils/clipboard-helpers';

interface LicensesActionDropdownProps {
  license:
    | (Omit<License, 'licenseKeyLookup'> & {
        products: Product[];
        customers: Customer[];
        metadata: Metadata[];
      })
    | undefined;
  variant?: VariantProps<typeof buttonVariants>['variant'];
}

export const LicensesActionDropdown = ({
  license,
  variant = 'ghost',
}: LicensesActionDropdownProps) => {
  const t = useTranslations();
  const ctx = useContext(LicenseModalContext);

  if (!license) return null;

  const handleCopy = async (licenseKey: string) => {
    await copyToClipboard(
      licenseKey,
      t('general.copied_to_clipboard'),
      t('general.error_occurred'),
    );
  };

  const hasCustomerWithEmail = license.customers.some((c) => c.email);

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
          onClick={async (e) => {
            e.stopPropagation();
            await copyToClipboard(
              license.id,
              t('general.copied_to_clipboard'),
              t('general.error_occurred'),
            );
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          {t('general.copy_id')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="hover:cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            handleCopy(license.licenseKey);
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          {t('dashboard.licenses.copy_license_key')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="hover:cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            ctx.setLicenseToEdit(license);
            ctx.setLicenseModalOpen(true);
          }}
        >
          <Edit className="mr-2 h-4 w-4" />
          {t('dashboard.licenses.edit_license')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="hover:cursor-pointer"
          disabled={!hasCustomerWithEmail}
          onClick={(e) => {
            e.stopPropagation();
            ctx.setLicenseEmailDelivery(license);
            ctx.setLicenseEmailDeliveryModalOpen(true);
          }}
        >
          <Send className="mr-2 h-4 w-4" />
          {t('dashboard.licenses.send_email_delivery')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-destructive hover:cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            ctx.setLicenseToDelete(license);
            ctx.setLicenseToDeleteModalOpen(true);
          }}
        >
          <Trash className="mr-2 h-4 w-4" />
          {t('dashboard.licenses.delete_license')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
