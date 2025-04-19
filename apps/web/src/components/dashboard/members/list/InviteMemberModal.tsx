'use client';
import { ITeamsInviteResponse } from '@/app/api/(dashboard)/teams/invite/route';
import LoadingButton from '@/components/shared/LoadingButton';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import {
  InviteMemberSchema,
  inviteMemberSchema,
} from '@/lib/validation/team/invite-member-schema';
import { MemberModalContext } from '@/providers/MemberModalProvider';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useContext, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export default function InviteMemberModal() {
  const t = useTranslations();
  const ctx = useContext(MemberModalContext);
  const [loading, setLoading] = useState(false);
  const { mutate } = useSWRConfig();

  const form = useForm<InviteMemberSchema>({
    resolver: zodResolver(inviteMemberSchema(t)),
    defaultValues: {
      email: '',
    },
  });

  const handleMemberInvite = async (payload: InviteMemberSchema) => {
    const response = await fetch('/api/teams/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ITeamsInviteResponse;

    return data;
  };

  const onSubmit = async (data: InviteMemberSchema) => {
    setLoading(true);
    try {
      const res = await handleMemberInvite(data);

      if ('message' in res) {
        if (res.field) {
          return form.setError(res.field as keyof InviteMemberSchema, {
            type: 'manual',
            message: res.message,
          });
        }

        handleOpenChange(false);
        return toast.error(res.message);
      }

      mutate((key) => Array.isArray(key) && key[0] === '/api/teams/members');
      handleOpenChange(false);
      toast.success(t('dashboard.members.member_invited'));
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setMemberModalOpen(open);
    form.reset();
  };

  return (
    <>
      <ResponsiveDialog
        open={ctx.memberModalOpen}
        onOpenChange={handleOpenChange}
      >
        <ResponsiveDialogContent className="sm:max-w-[625px]">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t('dashboard.members.invite_member')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t('dashboard.members.invite_member_description')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <Form {...form}>
            <form
              className="space-y-4 max-md:px-2"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('general.email')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="support@lukittu.com"
                        type="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <button className="hidden" type="submit" />
            </form>
          </Form>
          <ResponsiveDialogFooter>
            <div>
              <LoadingButton
                className="w-full"
                type="submit"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {t('general.close')}
              </LoadingButton>
            </div>
            <div>
              <LoadingButton
                className="w-full"
                pending={loading}
                type="submit"
                onClick={() => form.handleSubmit(onSubmit)()}
              >
                {t('dashboard.members.send_invite')}
              </LoadingButton>
            </div>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
