'use client';
import { ICustomersGetSuccessResponse } from '@/app/api/(dashboard)/customers/route';
import { ILicenseGetSuccessResponse } from '@/app/api/(dashboard)/licenses/[slug]/route';
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
import { CustomerModalContext } from '@/providers/CustomerModalProvider';
import { VariantProps } from 'class-variance-authority';
import { Edit, Ellipsis, Trash, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useState } from 'react';

interface CustomersActionDropdownProps {
  customer: ICustomersGetSuccessResponse['customers'][number] | undefined;
  license?: ILicenseGetSuccessResponse['license'] | undefined;
  handleLicenseCustomersSet?: (customerIds: string[]) => Promise<void>;
  variant?: VariantProps<typeof buttonVariants>['variant'];
}

export const CustomersActionDropdown = ({
  customer,
  variant = 'ghost',
  handleLicenseCustomersSet,
  license,
}: CustomersActionDropdownProps) => {
  const ctx = useContext(CustomerModalContext);
  const t = useTranslations();
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const handleCustomerRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!license || !handleLicenseCustomersSet) return;

    try {
      await handleLicenseCustomersSet(
        license.customers.filter((c) => c.id !== customer?.id).map((c) => c.id),
      );
    } finally {
      setShowRemoveConfirm(false);
    }
  };

  if (!customer) return null;

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
              ctx.setCustomerToEdit(customer);
              ctx.setCustomerModalOpen(true);
            }}
          >
            <Edit className="mr-2 h-4 w-4" />
            {t('dashboard.customers.edit_customer')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {Boolean(license && handleLicenseCustomersSet) && (
            <DropdownMenuItem
              className="text-destructive hover:cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setShowRemoveConfirm(true);
              }}
            >
              <X className="mr-2 h-4 w-4" />
              {t('dashboard.licenses.remove_customer')}
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            className="text-destructive hover:cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              ctx.setCustomerToDelete(customer);
              ctx.setCustomerToDeleteModalOpen(true);
            }}
          >
            <Trash className="mr-2 h-4 w-4" />
            {t('dashboard.customers.delete_customer')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
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
            <AlertDialogCancel
              onClick={(e) => {
                e.stopPropagation();
                setShowRemoveConfirm(false);
              }}
            >
              {t('general.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleCustomerRemove}>
              {t('general.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
