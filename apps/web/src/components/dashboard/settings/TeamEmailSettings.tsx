import { ITeamGetSuccessResponse } from '@/app/api/(dashboard)/teams/[slug]/route';
import {
  ITeamsEmailImageDeleteResponse,
  ITeamsEmailImageSetResponse,
} from '@/app/api/(dashboard)/teams/settings/email/image/route';
import { ITeamsSettingsEmailEditResponse } from '@/app/api/(dashboard)/teams/settings/email/route';
import LoadingButton from '@/components/shared/LoadingButton';
import { Badge } from '@/components/ui/badge';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { bytesToSize } from '@/lib/utils/number-helpers';
import { cn } from '@/lib/utils/tailwind-helpers';
import {
  SetTeamEmailSettingsSchema,
  setTeamEmailSettingsSchema,
} from '@/lib/validation/team/set-team-email-settings-schema';
import { TeamContext } from '@/providers/TeamProvider';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface TeamEmailSettingsProps {
  team: ITeamGetSuccessResponse['team'] | null;
}

export default function TeamEmailSettings({ team }: TeamEmailSettingsProps) {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);

  const selectedTeam = teamCtx.teams.find(
    (team) => team.id === teamCtx.selectedTeam,
  );

  const hasCustomEmailsPermission =
    selectedTeam?.limits?.allowCustomEmails ?? false;

  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const form = useForm<SetTeamEmailSettingsSchema>({
    resolver: zodResolver(setTeamEmailSettingsSchema(t)),
    defaultValues: {
      emailMessage: '',
    },
  });

  const { handleSubmit, reset, control, watch } = form;

  const emailMessage = watch('emailMessage');

  useEffect(() => {
    reset({
      emailMessage: team?.settings.emailMessage ?? '',
    });
  }, [team, reset]);

  const onSubmit = async (payload: SetTeamEmailSettingsSchema) => {
    setLoading(true);
    try {
      const response = await fetch('/api/teams/settings/email', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as ITeamsSettingsEmailEditResponse;

      if ('message' in data) {
        toast.error(data.message);
        return;
      }

      toast.success(t('dashboard.settings.team_settings_updated'));
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (team) {
      setImageUrl(team.settings.emailImageUrl ?? null);
    }
  }, [team]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/teams/settings/email/image', {
        method: 'POST',
        body: formData,
      });

      const data = (await response.json()) as ITeamsEmailImageSetResponse;

      if ('message' in data) {
        toast.error(data.message);
        return;
      }

      setImageUrl(data.url);
      toast.success(t('dashboard.settings.team_settings_updated'));
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      const response = await fetch('/api/teams/settings/email/image', {
        method: 'DELETE',
      });

      const data = (await response.json()) as ITeamsEmailImageDeleteResponse;

      if ('message' in data) {
        toast.error(data.message);
        return;
      }

      setImageUrl(null);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center text-xl font-bold">
          {t('dashboard.settings.email_settings')}
          {!hasCustomEmailsPermission && (
            <Badge className="ml-2 text-xs" variant="primary">
              PRO
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className={cn(
              'space-y-2 max-md:px-2',
              !hasCustomEmailsPermission && 'opacity-50',
            )}
            onSubmit={handleSubmit(onSubmit)}
          >
            <div className="relative">
              <div className="mb-1">
                <div className="text-sm font-semibold">
                  {t('dashboard.settings.email_header_image')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('dashboard.settings.recommended_dimensions', {
                    width: 512,
                    height: 128,
                  })}
                </div>
              </div>
              <div
                className={cn(
                  'relative h-24 w-full overflow-hidden rounded-md',
                  'border bg-background p-4',
                  'flex items-center justify-center',
                  !hasCustomEmailsPermission && 'cursor-not-allowed',
                )}
                onClick={
                  hasCustomEmailsPermission ? handleFileSelect : undefined
                }
              >
                {imageUrl ? (
                  <Image
                    alt="Team email header"
                    className="h-auto max-h-full w-auto object-contain"
                    height={128}
                    quality={100}
                    src={imageUrl}
                    width={512}
                    priority
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <span className="text-sm">
                      {t('dashboard.settings.no_header_image')}
                    </span>
                  </div>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <LoadingButton
                    className="absolute bottom-2 left-2"
                    disabled={uploading || !hasCustomEmailsPermission}
                    pending={uploading}
                    size="sm"
                    variant="secondary"
                  >
                    {t('general.edit')}
                  </LoadingButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    disabled={!hasCustomEmailsPermission}
                    onClick={handleFileSelect}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {t('general.upload_photo')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={
                      uploading || !imageUrl || !hasCustomEmailsPermission
                    }
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
              name="emailMessage"
              render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between pt-2">
                    <FormLabel htmlFor="emailMessage">
                      {t('dashboard.settings.email_delivery_message')}
                    </FormLabel>
                    <div className="flex justify-end text-xs text-muted-foreground">
                      {emailMessage?.length ?? 0} / 1000
                    </div>
                  </div>
                  <Textarea
                    {...field}
                    className="form-textarea"
                    disabled={!team || loading || !hasCustomEmailsPermission}
                    id="emailMessage"
                    maxLength={1000}
                  />
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
          disabled={!hasCustomEmailsPermission}
          pending={loading}
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
