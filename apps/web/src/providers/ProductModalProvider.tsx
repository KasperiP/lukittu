'use client';
import { DeleteProductConfirmModal } from '@/components/dashboard/products/ProductDeleteConfirmModal';
import SetProductModal from '@/components/dashboard/products/list/SetProductModal';
import { Metadata, Product } from '@lukittu/shared';
import { createContext, useState } from 'react';

type ProductExtended = Product & {
  metadata: Metadata[];
};

export const ProductModalContext = createContext({
  setProductToDelete: (_product: ProductExtended | null) => {},
  setProductToEdit: (_product: ProductExtended | null) => {},
  setProductModalOpen: (_open: boolean) => {},
  setProductToDeleteModalOpen: (_open: boolean) => {},
  productToEdit: null as ProductExtended | null,
  productToDelete: null as ProductExtended | null,
  productToDeleteModalOpen: false,
  productModalOpen: false,
});

export const ProductModalProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [productToDelete, setProductToDelete] =
    useState<ProductExtended | null>(null);
  const [productToDeleteModalOpen, setProductToDeleteModalOpen] =
    useState(false);
  const [productToEdit, setProductToEdit] = useState<ProductExtended | null>(
    null,
  );
  const [productModalOpen, setProductModalOpen] = useState(false);

  return (
    <ProductModalContext.Provider
      value={{
        setProductToDelete,
        setProductModalOpen,
        setProductToDeleteModalOpen,
        setProductToEdit,
        productToEdit,
        productToDelete,
        productToDeleteModalOpen,
        productModalOpen,
      }}
    >
      <SetProductModal />
      <DeleteProductConfirmModal />
      {children}
    </ProductModalContext.Provider>
  );
};
