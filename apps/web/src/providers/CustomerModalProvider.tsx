'use client';
import { DeleteCustomerConfirmModal } from '@/components/dashboard/customers/CustomerDeleteConfirmModal';
import SetCustomerModal from '@/components/dashboard/customers/list/SetCustomerModal';
import { Address, Customer, Metadata } from '@lukittu/shared';
import { createContext, useState } from 'react';

type CustomerExtended = Customer & {
  metadata: Metadata[];
  address: Address | null;
};

export const CustomerModalContext = createContext({
  setCustomerModalOpen: (open: boolean) => {},
  setCustomerToDelete: (customer: CustomerExtended | null) => {},
  setCustomerToEdit: (customer: CustomerExtended | null) => {},
  setCustomerToDeleteModalOpen: (open: boolean) => {},
  customerModalOpen: false,
  customerToDelete: null as CustomerExtended | null,
  customerToEdit: null as CustomerExtended | null,
  customerToDeleteModalOpen: false,
});

export const CustomerModalProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [customerToDeleteModalOpen, setCustomerToDeleteModalOpen] =
    useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<CustomerExtended | null>(
    null,
  );
  const [customerToDelete, setCustomerToDelete] =
    useState<CustomerExtended | null>(null);

  return (
    <CustomerModalContext.Provider
      value={{
        setCustomerModalOpen,
        setCustomerToEdit,
        setCustomerToDelete,
        setCustomerToDeleteModalOpen,
        customerModalOpen,
        customerToEdit,
        customerToDelete,
        customerToDeleteModalOpen,
      }}
    >
      <DeleteCustomerConfirmModal />
      <SetCustomerModal />
      {children}
    </CustomerModalContext.Provider>
  );
};
