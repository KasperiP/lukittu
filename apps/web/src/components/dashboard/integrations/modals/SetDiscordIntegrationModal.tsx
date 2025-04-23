import {
  ITeamsIntegrationsDiscordDeleteResponse,
  ITeamsIntegrationsDiscordSetResponse,
} from '@/app/api/(dashboard)/teams/integrations/discord/route';
import { ITeamsIntegrationsGetSuccessResponse } from '@/app/api/(dashboard)/teams/integrations/route';
import { DiscordIcon } from '@/components/shared/Icons';
import LoadingButton from '@/components/shared/LoadingButton';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  SetDiscordIntegrationSchema,
  setDiscordIntegrationSchema,
} from '@/lib/validation/integrations/set-discord-integration-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface SetDiscordIntegrationModalProps {
  discordIntegration: ITeamsIntegrationsGetSuccessResponse['integrations']['discordIntegration'];
  open: boolean;
  onOpenChange: (boolean: boolean) => void;
}

// You may need to replace these with your actual Discord URLs
const DISCORD_BOT_SERVER_URL = `https://discord.com/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&integration_type=0&scope=applications.commands`;

const DISCORD_BOT_USER_URL = `https://discord.com/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&integration_type=1&scope=applications.commands`;

export default function SetDiscordIntegrationModal({
  discordIntegration,
  onOpenChange,
  open,
}: SetDiscordIntegrationModalProps) {
  const t = useTranslations();

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<SetDiscordIntegrationSchema>({
    resolver: zodResolver(setDiscordIntegrationSchema()),
    defaultValues: {
      active: true,
    },
  });

  const { setValue, handleSubmit, reset, control } = form;

  useEffect(() => {
    if (discordIntegration) {
      setValue('active', discordIntegration.active);
    } else {
      setValue('active', true);
    }
  }, [discordIntegration, open, setValue]);

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    reset();
  };

  const handleDiscordIntegrationSet = async (
    payload: SetDiscordIntegrationSchema,
  ) => {
    const response = await fetch('/api/teams/integrations/discord', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data =
      (await response.json()) as ITeamsIntegrationsDiscordSetResponse;

    return data;
  };

  const handleDiscordIntegrationDelete = async () => {
    const response = await fetch('/api/teams/integrations/discord', {
      method: 'DELETE',
    });

    const data =
      (await response.json()) as ITeamsIntegrationsDiscordDeleteResponse;

    return data;
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await handleDiscordIntegrationDelete();
      if ('message' in res) {
        toast.error(res.message);
        return;
      }

      toast.success(t('dashboard.integrations.discord_integration_deleted'));
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setDeleting(false);
    }
  };

  const onSubmit = async (payload: SetDiscordIntegrationSchema) => {
    setSubmitting(true);
    try {
      const res = await handleDiscordIntegrationSet(payload);
      if ('message' in res) {
        toast.error(res.message);
        return;
      }

      toast.success(
        Boolean(discordIntegration)
          ? t('dashboard.integrations.discord_integration_updated')
          : t('dashboard.integrations.discord_integration_created'),
      );
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[625px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {Boolean(discordIntegration)
              ? t('dashboard.integrations.manage_integration')
              : t('dashboard.integrations.setup_integration')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="mt-1.5">
            {t('dashboard.integrations.discord_integration_description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <Form {...form}>
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col space-y-2">
              <div className="space-y-4">
                <div>
                  <div className="mb-3 flex items-center">
                    <span className="mr-2">
                      <DiscordIcon />
                    </span>
                    <h4 className="font-medium">
                      {t('dashboard.integrations.add_to_server')}
                    </h4>
                  </div>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {t('dashboard.integrations.server_install_description', {
                      defaultValue:
                        'Add the bot to your Discord server to enable server-wide commands and functionality.',
                    })}
                  </p>
                  <Button
                    className="w-full sm:w-auto"
                    size="sm"
                    variant="default"
                    onClick={() =>
                      window.open(DISCORD_BOT_SERVER_URL, '_blank')
                    }
                  >
                    {t('dashboard.integrations.add_to_server')}
                  </Button>
                </div>

                <Separator />

                <div>
                  <div className="mb-3 flex items-center">
                    <span className="mr-2">
                      <DiscordIcon />
                    </span>
                    <h4 className="font-medium">
                      {t('dashboard.integrations.user_install')}
                    </h4>
                  </div>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {t('dashboard.integrations.user_install_description', {
                      defaultValue:
                        'Add the bot as a user integration to access Discord features through direct messages.',
                    })}
                  </p>
                  <Button
                    className="w-full sm:w-auto"
                    size="sm"
                    variant="default"
                    onClick={() => window.open(DISCORD_BOT_USER_URL, '_blank')}
                  >
                    {t('dashboard.integrations.user_install')}
                  </Button>
                </div>
              </div>
            </div>

            <FormField
              control={control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t('general.active')}</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      disabled={!discordIntegration}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
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
          {Boolean(discordIntegration) && (
            <div>
              <LoadingButton
                className="w-full"
                pending={deleting}
                type="submit"
                variant="destructive"
                onClick={handleDelete}
              >
                {t('general.delete')}
              </LoadingButton>
            </div>
          )}
          <div>
            <LoadingButton
              className="w-full"
              pending={submitting}
              type="submit"
              onClick={() => handleSubmit(onSubmit)()}
            >
              {Boolean(discordIntegration)
                ? t('general.edit')
                : t('general.create')}
            </LoadingButton>
          </div>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
