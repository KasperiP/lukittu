'use client';
import { IUsersChangePasswordResponse } from '@/app/api/(dashboard)/users/change-password/route';
import LoadingButton from '@/components/shared/LoadingButton';
import PasswordIndicator from '@/components/shared/PasswordIndicator';
import { Button } from '@/components/ui/button';
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
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import {
  ChangePasswordSchema,
  changePasswordSchema,
} from '@/lib/validation/profile/change-password-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface ChangePasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ChangePasswordModal({
  open,
  onOpenChange,
}: ChangePasswordModalProps) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<ChangePasswordSchema>({
    resolver: zodResolver(changePasswordSchema(t)),
    defaultValues: {
      newPassword: '',
      password: '',
      passwordConfirmation: '',
    },
  });

  const handleChangePassword = async (payload: ChangePasswordSchema) => {
    const response = await fetch('/api/users/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as IUsersChangePasswordResponse;

    return data;
  };

  const onSubmit = async (data: ChangePasswordSchema) => {
    setLoading(true);
    try {
      const res = await handleChangePassword(data);

      if ('message' in res) {
        if (res.field) {
          return form.setError(res.field as keyof ChangePasswordSchema, {
            type: 'manual',
            message: res.message,
          });
        }

        toast.error(res.message);
        return;
      }

      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    form.reset();
    onOpenChange(open);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[625px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.profile.change_password')}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center">
                    <FormLabel htmlFor="password">
                      {t('general.password')}
                    </FormLabel>
                  </div>
                  <FormControl>
                    <div className="relative">
                      <Input
                        id="password"
                        placeholder="********"
                        type={showPassword ? 'text' : 'password'}
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="newPassword">
                      {t('dashboard.profile.new_password')}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          id="newPassword"
                          placeholder="********"
                          type={showPassword ? 'text' : 'password'}
                          {...field}
                        />
                        <Button
                          className="absolute bottom-1 right-1 h-7 w-7"
                          size="icon"
                          type="button"
                          variant="ghost"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <PasswordIndicator password={form.watch('newPassword')} />
            </div>
            <FormField
              control={form.control}
              name="passwordConfirmation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="passwordConfirmation">
                    {t('auth.reset_password.confirm_password')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      id="passwordConfirmation"
                      placeholder="********"
                      type={showPassword ? 'text' : 'password'}
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
              {t('general.save')}
            </LoadingButton>
          </div>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
