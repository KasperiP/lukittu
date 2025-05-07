'use client';
import { ReleaseBranch } from '@lukittu/shared';
import React, { createContext, ReactNode, useState } from 'react';

interface BranchModalContextType {
  branchModalOpen: boolean;
  setBranchModalOpen: (open: boolean) => void;
  branchDeleteModalOpen: boolean;
  setBranchDeleteModalOpen: (open: boolean) => void;
  productId: string | null;
  branchToEdit: ReleaseBranch | null;
  setBranchToEdit: (branch: ReleaseBranch | null) => void;
  branchToDelete: ReleaseBranch | null;
  setBranchToDelete: (branch: ReleaseBranch | null) => void;
}

export const BranchModalContext = createContext<BranchModalContextType>({
  branchModalOpen: false,
  setBranchModalOpen: () => {},
  branchDeleteModalOpen: false,
  setBranchDeleteModalOpen: () => {},
  productId: null,
  branchToEdit: null,
  setBranchToEdit: () => {},
  branchToDelete: null,
  setBranchToDelete: () => {},
});

interface BranchModalProviderProps {
  children: ReactNode;
  productId: string;
}

export const BranchModalProvider: React.FC<BranchModalProviderProps> = ({
  children,
  productId,
}) => {
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchDeleteModalOpen, setBranchDeleteModalOpen] = useState(false);
  const [branchToEdit, setBranchToEdit] = useState<ReleaseBranch | null>(null);
  const [branchToDelete, setBranchToDelete] = useState<ReleaseBranch | null>(
    null,
  );

  return (
    <BranchModalContext.Provider
      value={{
        branchModalOpen,
        setBranchModalOpen,
        branchDeleteModalOpen,
        setBranchDeleteModalOpen,
        productId,
        branchToEdit,
        setBranchToEdit,
        branchToDelete,
        setBranchToDelete,
      }}
    >
      {children}
    </BranchModalContext.Provider>
  );
};
