'use client';
import { IUsersImageSetResponse } from '@/app/api/(dashboard)/users/image/route';
import { IUsersUpdateResponse } from '@/app/api/(dashboard)/users/route';
import LoadingButton from '@/components/shared/LoadingButton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { bytesToSize } from '@/lib/utils/number-helpers';
import { firstLetterUppercase, getInitials } from '@/lib/utils/text-helpers';
import {
  UpdateProfileSchema,
  updateProfileSchema,
} from '@/lib/validation/profile/update-profile-schema';
import { AuthContext } from '@/providers/AuthProvider';
import { zodResolver } from '@hookform/resolvers/zod';
import { Edit, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import ChangePasswordModal from './ChangePasswordModal';

export default function GeneralSettingsCard() {
  const t = useTranslations();
  const authCtx = useContext(AuthContext);
  const user = authCtx.session?.user;
  const [edit, setEdit] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const form = useForm<UpdateProfileSchema>({
    resolver: zodResolver(updateProfileSchema(t)),
    defaultValues: {
      fullName: '',
    },
  });

  const { handleSubmit, reset, setError, control, formState } = form;

  useEffect(() => {
    if (user) {
      reset({ fullName: user.fullName });
    }
  }, [user, reset]);

  const handleCancel = () => {
    setEdit(false);
    reset();
  };

  const handleProfileUpdate = async (payload: UpdateProfileSchema) => {
    const response = await fetch('/api/users', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as IUsersUpdateResponse;

    return data;
  };

  const onSubmit = async (data: UpdateProfileSchema) => {
    setLoading(true);
    try {
      const res = await handleProfileUpdate(data);
      if ('message' in res) {
        return setError(res.field as keyof UpdateProfileSchema, {
          type: 'manual',
          message: res.message,
        });
      }

      const session = authCtx.session;
      if (session) {
        authCtx.setSession({
          ...session,
          user: {
            ...session.user,
            fullName: data.fullName,
          },
        });
      }
      setEdit(false);
      toast.success(t('dashboard.profile.profile_updated_success'));
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/users/image', {
        method: 'POST',
        body: formData,
      });

      const data = (await response.json()) as IUsersImageSetResponse;

      if ('message' in data) {
        toast.error(data.message);
        return;
      }

      toast.success(t('dashboard.profile.profile_picture_updated'));

      authCtx.setSession((session) => ({
        ...session!,
        user: {
          ...session!.user,
          imageUrl: data.url,
        },
      }));
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      const response = await fetch('/api/users/image', {
        method: 'DELETE',
      });

      const data = (await response.json()) as IUsersImageSetResponse;

      if ('message' in data) {
        toast.error(data.message);
        return;
      }

      toast.success(t('dashboard.profile.profile_picture_removed'));

      authCtx.setSession((session) => ({
        ...session!,
        user: {
          ...session!.user,
          imageUrl: null,
        },
      }));
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = false;
    input.accept = 'image/jpeg, image/png, image/webp';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (file.size > 1048576) {
          return toast.error(
            t('validation.file_too_large', {
              bytesToSize: bytesToSize(1048576),
            }),
          );
        }
        await handleUpload(file);
      }
    };
    input.click();
  };

  const isTouched = formState.isDirty || formState.isSubmitting;

  return (
    <>
      <ChangePasswordModal
        open={changePasswordModalOpen}
        onOpenChange={setChangePasswordModalOpen}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">
            {t('general.user')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              className="flex max-w-md flex-1 flex-col gap-6"
              onSubmit={handleSubmit(onSubmit)}
            >
              <div>
                <div className="relative">
                  <div className="mb-1 text-sm font-semibold">
                    {t('general.avatar')}
                  </div>
                  <Avatar className="h-32 w-32 border max-md:h-28 max-md:w-28">
                    <AvatarImage src={user?.imageUrl!} asChild>
                      {user?.imageUrl && (
                        <Image
                          alt="User image"
                          className="object-cover"
                          height={128}
                          src={user.imageUrl}
                          width={128}
                        />
                      )}
                    </AvatarImage>
                    <AvatarFallback className="bg-primary text-2xl text-white">
                      {getInitials(user?.fullName ?? '??')}
                    </AvatarFallback>
                  </Avatar>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <LoadingButton
                        className="absolute bottom-0 left-0"
                        disabled={uploading}
                        pending={uploading}
                        size="sm"
                        variant="secondary"
                      >
                        {t('general.edit')}
                      </LoadingButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={handleFileSelect}>
                        <Upload className="mr-2 h-4 w-4" />
                        {t('general.upload_photo')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!user?.imageUrl || uploading}
                        onClick={handleRemove}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('general.remove_photo')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="flex min-h-10 items-center text-sm max-sm:flex-col max-sm:items-start max-sm:gap-2">
                <div className="w-1/3 font-semibold">{t('general.email')}</div>
                <div className="w-2/3">{user?.email}</div>
              </div>
              <div className="flex min-h-10 items-start text-sm max-sm:flex-col max-sm:items-start max-sm:gap-2">
                <div className="flex h-full min-h-10 w-1/3 items-center font-semibold max-sm:h-auto max-sm:min-h-[auto]">
                  {t('general.name')}
                </div>
                {edit ? (
                  <FormField
                    control={control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem className="w-2/3 max-sm:w-full">
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="flex min-h-10 w-2/3 items-center max-sm:w-full">
                    {user?.fullName}
                  </div>
                )}
              </div>
              <div className="flex min-h-10 items-center text-sm max-sm:h-auto max-sm:flex-col max-sm:items-start max-sm:gap-2">
                <div className="w-1/3 font-semibold max-sm:w-full">
                  {t('general.password')}
                </div>
                {edit ? (
                  <Button
                    disabled={user?.provider !== 'CREDENTIALS'}
                    size="sm"
                    type="button"
                    variant="secondary"
                    onClick={() => setChangePasswordModalOpen(true)}
                  >
                    {t('dashboard.profile.change_password')}...
                  </Button>
                ) : (
                  <div className="w-2/3 max-sm:w-full">••••••••</div>
                )}
              </div>
              <div className="flex min-h-10 items-center text-sm max-sm:flex-col max-sm:items-start max-sm:gap-2">
                <div className="w-1/3 font-semibold">
                  {t('dashboard.profile.login_provider')}
                </div>
                <div className="w-2/3">
                  {firstLetterUppercase(
                    t(
                      `auth.oauth.${user?.provider.toLowerCase() as 'google' | 'credentials'}`,
                    ),
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                {edit ? (
                  <>
                    <Button
                      size="sm"
                      type="button"
                      variant="secondary"
                      onClick={handleCancel}
                    >
                      {t('general.cancel')}
                    </Button>
                    <LoadingButton
                      disabled={!isTouched}
                      pending={loading}
                      size="sm"
                      type="submit"
                    >
                      {t('general.save')}
                    </LoadingButton>
                  </>
                ) : (
                  <Button
                    className="flex items-center gap-1"
                    size="sm"
                    type="button"
                    variant="secondary"
                    onClick={() => setEdit(true)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    {t('general.edit')}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
}
