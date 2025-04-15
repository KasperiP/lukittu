'use client';
import { IProductsReleasesSetLatestResponse } from '@/app/api/(dashboard)/products/releases/set-latest/route';
import SetReleaseModal from '@/components/dashboard/releases/list/SetReleaseModal';
import { DeleteDeleteConfirmModal } from '@/components/dashboard/releases/ReleaseDeleteConfirmModal';
import { License, Metadata, Release, ReleaseFile } from '@lukittu/prisma';
import { createContext, useState } from 'react';

type ReleaseExtended = Release & {
  file: ReleaseFile | null;
  allowedLicenses: Omit<License, 'licenseKeyLookup'>[];
  metadata: Metadata[];
};

export const ReleaseModalContext = createContext({
  setReleaseToDelete: (release: Release | null) => {},
  setReleaseToEdit: (release: ReleaseExtended | null) => {},
  setReleaseModalOpen: (open: boolean) => {},
  setReleaseToDeleteModalOpen: (open: boolean) => {},
  setReleaseAsLatest: (release: Release) =>
    ({}) as Promise<IProductsReleasesSetLatestResponse>,
  releaseToEdit: null as ReleaseExtended | null,
  releaseToDelete: null as Release | null,
  releaseToDeleteModalOpen: false,
  releaseModalOpen: false,
  productId: undefined as string | undefined,
});

export const ReleaseModalProvider = ({
  children,
  productId,
}: {
  children: React.ReactNode;
  productId?: string;
}) => {
  const [releaseToDelete, setReleaseToDelete] = useState<Release | null>(null);
  const [releaseToDeleteModalOpen, setReleaseToDeleteModalOpen] =
    useState(false);
  const [releaseToEdit, setReleaseToEdit] = useState<ReleaseExtended | null>(
    null,
  );
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);

  const setReleaseAsLatest = async (release: Release) => {
    const response = await fetch('/api/products/releases/set-latest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ releaseId: release.id }),
    });

    const data = (await response.json()) as IProductsReleasesSetLatestResponse;

    return data;
  };

  return (
    <ReleaseModalContext.Provider
      value={{
        setReleaseToDelete,
        setReleaseModalOpen,
        setReleaseToDeleteModalOpen,
        setReleaseToEdit,
        setReleaseAsLatest,
        releaseToEdit,
        releaseToDelete,
        releaseToDeleteModalOpen,
        releaseModalOpen,
        productId,
      }}
    >
      <DeleteDeleteConfirmModal />
      <SetReleaseModal />
      {children}
    </ReleaseModalContext.Provider>
  );
};
