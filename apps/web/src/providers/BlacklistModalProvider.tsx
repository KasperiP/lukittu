'use client';
import { DeleteBlacklistConfirmModal } from '@/components/dashboard/blacklist/BlacklistDeleteConfirmModal';
import SetBlacklistModal from '@/components/dashboard/blacklist/SetBlacklistModal';
import { Blacklist, Metadata } from '@lukittu/shared';
import { createContext, useState } from 'react';

type BlacklistExtended = Blacklist & {
  country: string | null;
  alpha2: string | null;
  metadata: Metadata[];
};

export const BlacklistModalContext = createContext({
  setBlacklistToDelete: (_blacklist: BlacklistExtended | null) => {},
  setBlacklistToEdit: (_blacklist: BlacklistExtended | null) => {},
  setBlacklistModalOpen: (_open: boolean) => {},
  setBlacklistToDeleteModalOpen: (_open: boolean) => {},
  blacklistToEdit: null as BlacklistExtended | null,
  blacklistToDelete: null as BlacklistExtended | null,
  blacklistToDeleteModalOpen: false,
  blacklistModalOpen: false,
});

export const BlacklistModalProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [blacklistToDelete, setBlacklistToDelete] =
    useState<BlacklistExtended | null>(null);
  const [blacklistToDeleteModalOpen, setBlacklistToDeleteModalOpen] =
    useState(false);
  const [blacklistToEdit, setBlacklistToEdit] =
    useState<BlacklistExtended | null>(null);
  const [blacklistModalOpen, setBlacklistModalOpen] = useState(false);

  return (
    <BlacklistModalContext.Provider
      value={{
        setBlacklistToDelete,
        setBlacklistModalOpen,
        setBlacklistToDeleteModalOpen,
        setBlacklistToEdit,
        blacklistToEdit,
        blacklistToDelete,
        blacklistToDeleteModalOpen,
        blacklistModalOpen,
      }}
    >
      <DeleteBlacklistConfirmModal />
      <SetBlacklistModal />
      {children}
    </BlacklistModalContext.Provider>
  );
};
