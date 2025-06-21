'use client';
import { Webhook } from '@lukittu/shared';
import React, { createContext, ReactNode, useState } from 'react';

interface WebhookModalContextType {
  webhookModalOpen: boolean;
  setWebhookModalOpen: (open: boolean) => void;
  webhookDeleteModalOpen: boolean;
  setWebhookDeleteModalOpen: (open: boolean) => void;
  webhookToEdit: Webhook | null;
  setWebhookToEdit: (webhook: Webhook | null) => void;
  webhookToDelete: Webhook | null;
  setWebhookToDelete: (webhook: Webhook | null) => void;
}

export const WebhookModalContext = createContext<WebhookModalContextType>({
  webhookModalOpen: false,
  setWebhookModalOpen: () => {},
  webhookDeleteModalOpen: false,
  setWebhookDeleteModalOpen: () => {},
  webhookToEdit: null,
  setWebhookToEdit: () => {},
  webhookToDelete: null,
  setWebhookToDelete: () => {},
});

interface WebhookModalProviderProps {
  children: ReactNode;
}

export const WebhookModalProvider: React.FC<WebhookModalProviderProps> = ({
  children,
}) => {
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [webhookDeleteModalOpen, setWebhookDeleteModalOpen] = useState(false);
  const [webhookToEdit, setWebhookToEdit] = useState<Webhook | null>(null);
  const [webhookToDelete, setWebhookToDelete] = useState<Webhook | null>(null);

  return (
    <WebhookModalContext.Provider
      value={{
        webhookModalOpen,
        setWebhookModalOpen,
        webhookDeleteModalOpen,
        setWebhookDeleteModalOpen,
        webhookToEdit,
        setWebhookToEdit,
        webhookToDelete,
        setWebhookToDelete,
      }}
    >
      {children}
    </WebhookModalContext.Provider>
  );
};
