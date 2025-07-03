'use client';
import { DeleteLicenseConfirmModal } from '@/components/dashboard/licenses/LicenseDeleteConfirmModal';
import { LicenseEmailDeliveryModal } from '@/components/dashboard/licenses/LicenseEmailDeliveryModal';
import SetLicenseModal from '@/components/dashboard/licenses/list/SetLicenseModal';
import { Customer, License, Metadata, Product } from '@lukittu/shared';
import { createContext, useState } from 'react';

type LicenseExtended = Omit<License, 'licenseKeyLookup'> & {
  products: Product[];
  customers: Customer[];
  metadata: Metadata[];
};

export const LicenseModalContext = createContext({
  setLicenseModalOpen: (_open: boolean) => {},
  setLicenseToEdit: (_license: LicenseExtended | null) => {},
  setLicenseToDelete: (
    _license: Omit<License, 'licenseKeyLookup'> | null,
  ) => {},
  setLicenseToDeleteModalOpen: (_open: boolean) => {},
  setLicenseEmailDeliveryModalOpen: (_open: boolean) => {},
  setLicenseEmailDelivery: (_license: LicenseExtended | null) => {},
  licenseToEdit: null as LicenseExtended | null,
  licenseModalOpen: false,
  licenseToDelete: null as Omit<License, 'licenseKeyLookup'> | null,
  licenseToDeleteModalOpen: false,
  licenseEmailDeliveryModalOpen: false,
  licenseEmailDelivery: null as LicenseExtended | null,
  initialProductIds: [] as string[],
  initialCustomerIds: [] as string[],
});

export const LicenseModalProvider = ({
  children,
  initialProductIds = [],
  initialCustomerIds = [],
}: {
  children: React.ReactNode;
  initialProductIds?: string[];
  initialCustomerIds?: string[];
}) => {
  const [licenseToDelete, setLicenseToDelete] = useState<Omit<
    License,
    'licenseKeyLookup'
  > | null>(null);
  const [licenseToDeleteModalOpen, setLicenseToDeleteModalOpen] =
    useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [licenseToEdit, setLicenseToEdit] = useState<LicenseExtended | null>(
    null,
  );
  const [licenseEmailDeliveryModalOpen, setLicenseEmailDeliveryModalOpen] =
    useState(false);
  const [licenseEmailDelivery, setLicenseEmailDelivery] =
    useState<LicenseExtended | null>(null);

  return (
    <LicenseModalContext.Provider
      value={{
        setLicenseToEdit,
        setLicenseModalOpen,
        setLicenseToDelete,
        setLicenseToDeleteModalOpen,
        setLicenseEmailDeliveryModalOpen,
        setLicenseEmailDelivery,
        licenseToEdit,
        licenseModalOpen,
        licenseToDelete,
        licenseToDeleteModalOpen,
        licenseEmailDeliveryModalOpen,
        licenseEmailDelivery,
        initialProductIds,
        initialCustomerIds,
      }}
    >
      <LicenseEmailDeliveryModal />
      <DeleteLicenseConfirmModal />
      <SetLicenseModal />
      {children}
    </LicenseModalContext.Provider>
  );
};
