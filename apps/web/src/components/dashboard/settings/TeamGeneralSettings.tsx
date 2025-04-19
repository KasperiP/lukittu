import { ITeamGetSuccessResponse } from '@/app/api/(dashboard)/teams/[slug]/route';
import { ITeamsImageSetResponse } from '@/app/api/(dashboard)/teams/image/route';
import { ITeamsCreateResponse } from '@/app/api/(dashboard)/teams/route';
import LoadingButton from '@/components/shared/LoadingButton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { bytesToSize } from '@/lib/utils/number-helpers';
import { getInitials } from '@/lib/utils/text-helpers';
import {
  SetTeamSchema,
  setTeamSchema,
} from '@/lib/validation/team/set-team-schema';
import { AuthContext } from '@/providers/AuthProvider';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface TeamGeneralSettingsProps {
  team: ITeamGetSuccessResponse['team'] | null;
}

export default function TeamGeneralSettings({
  team,
}: TeamGeneralSettingsProps) {
  const t = useTranslations();
  const ctx = useContext(AuthContext);
  const router = useRouter();

  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm<SetTeamSchema>({
    resolver: zodResolver(setTeamSchema(t)),
    defaultValues: {
      name: '',
    },
  });

  const { handleSubmit, reset, setError, control } = form;

  useEffect(() => {
    if (team) {
      setImageUrl(team.imageUrl ?? null);
      reset({ name: team.name });
    }
  }, [team, reset]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/teams/image', {
        method: 'POST',
        body: formData,
      });

      const data = (await response.json()) as ITeamsImageSetResponse;

      if ('message' in data) {
        toast.error(data.message);
        return;
      }

      setImageUrl(data.url);
      ctx.setSession((session) => ({
        ...session!,
        user: {
          ...session!.user,
          teams: session!.user.teams.map((t) =>
            t.id === team?.id ? { ...t, imageUrl: data.url } : t,
          ),
        },
      }));
      toast.success(t('dashboard.settings.team_image_updated'));
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      const response = await fetch('/api/teams/image', {
        method: 'DELETE',
      });

      const data = (await response.json()) as ITeamsImageSetResponse;

      if ('message' in data) {
        toast.error(data.message);
        return;
      }

      setImageUrl(null);
      ctx.setSession((session) => ({
        ...session!,
        user: {
          ...session!.user,
          teams: session!.user.teams.map((t) =>
            t.id === team?.id ? { ...t, imageUrl: null } : t,
          ),
        },
      }));
      toast.success(t('dashboard.settings.team_image_removed'));
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
              size: bytesToSize(1048576),
            }),
          );
        }
        await handleUpload(file);
      }
    };
    input.click();
  };

  const handleTeamEdit = async (payload: SetTeamSchema) => {
    const response = await fetch(`/api/teams/${team?.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ITeamsCreateResponse;

    return data;
  };

  const onSubmit = async (data: SetTeamSchema) => {
    setLoading(true);
    try {
      const res = await handleTeamEdit(data);

      if ('message' in res) {
        if (res.field) {
          return setError(res.field as keyof SetTeamSchema, {
            type: 'manual',
            message: res.message,
          });
        }

        return toast.error(res.message);
      }

      if ('team' in res && ctx.session) {
        ctx.setSession({
          ...ctx.session,
          user: {
            ...ctx.session.user,
            teams: ctx.session.user.teams.map((team) =>
              team.id === res.team.id
                ? {
                    ...team,
                    ...res.team,
                  }
                : team,
            ),
          },
        });
      }

      router.refresh();
      toast.success(t('dashboard.settings.team_settings_updated'));
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center text-xl font-bold">
          {t('dashboard.settings.general_settings')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="space-y-2 max-md:px-2"
            onSubmit={handleSubmit(onSubmit)}
          >
            <div className="relative">
              <div className="mb-1 text-sm font-semibold">
                {t('general.avatar')}
              </div>
              <Avatar className="h-32 w-32 border max-md:h-28 max-md:w-28">
                <AvatarImage src={imageUrl!} asChild>
                  {imageUrl && (
                    <Image
                      alt="Team image"
                      className="object-cover"
                      height={128}
                      quality={100}
                      src={imageUrl}
                      width={128}
                      priority
                    />
                  )}
                </AvatarImage>
                <AvatarFallback className="bg-primary text-2xl text-white">
                  {getInitials(team?.name ?? '??')}
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
                    disabled={uploading || !imageUrl}
                    onClick={handleRemove}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('general.remove_photo')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <FormField
              control={control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('general.name')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(
                        'dashboard.teams.my_first_team_placeholder',
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
          <button className="hidden" type="submit" />
        </Form>
      </CardContent>
      <CardFooter>
        <LoadingButton
          pending={loading || !team}
          size="sm"
          type="submit"
          variant="secondary"
          onClick={handleSubmit(onSubmit)}
        >
          <Save className="mr-2 h-4 w-4" />
          {t('general.save')}
        </LoadingButton>
      </CardFooter>
    </Card>
  );
}
