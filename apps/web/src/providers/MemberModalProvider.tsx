'use client';
import { CancelInviteConfirmModal } from '@/components/dashboard/members/CancelInviteConfirmModal';
import { KickMemberConfirmModal } from '@/components/dashboard/members/KickMemberConfirmModal';
import InviteMemberModal from '@/components/dashboard/members/list/InviteMemberModal';
import { User } from '@lukittu/shared';
import { createContext, useState } from 'react';

export const MemberModalContext = createContext({
  setMemberModalOpen: (open: boolean) => {},
  setMemberToKick: (member: Omit<User, 'passwordHash'> | null) => {},
  setMemberToCancelInvitation: (
    member: {
      id: string;
      email: string;
      createdAt: Date;
      isInvitation: true;
    } | null,
  ) => {},
  setMemberToKickModalOpen: (open: boolean) => {},
  setMemberToCancelInvitationModalOpen: (open: boolean) => {},
  memberModalOpen: false,
  memberToKick: null as Omit<User, 'passwordHash'> | null,
  memberToCancelInvitation: null as {
    id: string;
    email: string;
    createdAt: Date;
    isInvitation: true;
  } | null,
  memberToKickModalOpen: false,
  memberToCancelInvitationModalOpen: false,
});

export const MemberModalProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [
    memberToCancelInvitationModalOpen,
    setMemberToCancelInvitationModalOpen,
  ] = useState(false);
  const [memberToCancelInvitation, setMemberToCancelInvitation] = useState<{
    id: string;
    email: string;
    createdAt: Date;
    isInvitation: true;
  } | null>(null);
  const [memberToKickModalOpen, setMemberToKickModalOpen] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberToKick, setMemberToKick] = useState<Omit<
    User,
    'passwordHash'
  > | null>(null);

  return (
    <MemberModalContext.Provider
      value={{
        setMemberModalOpen,
        setMemberToKick,
        setMemberToKickModalOpen,
        setMemberToCancelInvitation,
        setMemberToCancelInvitationModalOpen,
        memberModalOpen,
        memberToKick,
        memberToKickModalOpen,
        memberToCancelInvitation,
        memberToCancelInvitationModalOpen,
      }}
    >
      <CancelInviteConfirmModal />
      <InviteMemberModal />
      <KickMemberConfirmModal />
      {children}
    </MemberModalContext.Provider>
  );
};
