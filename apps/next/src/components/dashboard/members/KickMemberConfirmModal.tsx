import { ITeamsMembersKickResponse } from '@/app/api/(dashboard)/teams/members/[slug]/route';
import LoadingButton from '@/components/shared/LoadingButton';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { MemberModalContext } from '@/providers/MemberModalProvider';
import { useTranslations } from 'next-intl';
import { useContext, useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export function KickMemberConfirmModal() {
  const t = useTranslations();
  const ctx = useContext(MemberModalContext);
  const [loading, setLoading] = useState(false);
  const { mutate } = useSWRConfig();

  const memberToKick = ctx.memberToKick;

  if (!memberToKick) return null;

  const handleTeamMemberKick = async (memberId: string) => {
    const response = await fetch(`/api/teams/members/${memberId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = (await response.json()) as ITeamsMembersKickResponse;

    return data;
  };

  const onSubmit = async () => {
    setLoading(true);
    try {
      const res = await handleTeamMemberKick(memberToKick.id);

      if ('message' in res) {
        toast.error(res.message);
      } else {
        toast.success(t('dashboard.members.member_kicked'));
      }

      mutate((key) => Array.isArray(key) && key[0] === '/api/teams/members');
      ctx.setMemberToKick(null);
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setMemberToKickModalOpen(open);
  };

  return (
    <>
      <ResponsiveDialog
        open={ctx.memberToKickModalOpen}
        onOpenChange={handleOpenChange}
      >
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t('dashboard.members.kick_member_confirm_title')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t.rich('dashboard.members.kick_member_confirm_description', {
                email: memberToKick.email,
                strong: (child) => <strong>{child}</strong>,
              })}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <LoadingButton
              size="sm"
              variant="outline"
              onClick={() => {
                handleOpenChange(false);
                ctx.setMemberToKick(null);
              }}
            >
              {t('general.cancel')}
            </LoadingButton>
            <LoadingButton
              pending={loading}
              size="sm"
              variant="destructive"
              onClick={onSubmit}
            >
              {t('dashboard.members.kick_member')}
            </LoadingButton>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
