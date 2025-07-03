import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ITeamsIntegrationsGetSuccessResponse } from '@/app/api/(dashboard)/teams/integrations/route';
import LoadingButton from '@/components/shared/LoadingButton';
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
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { Switch } from '@/components/ui/switch';
import {
  setPolymartIntegrationSchema,
  SetPolymartIntegrationSchema,
} from '@/lib/validation/integrations/set-polymart-integration-schema';
import { CopyIcon, EyeIcon, EyeOffIcon } from 'lucide-react';

interface SetPolymartIntegrationModalProps {
  polymartIntegration: ITeamsIntegrationsGetSuccessResponse['integrations']['polymartIntegration'];
  open: boolean;
  onOpenChange: (boolean: boolean) => void;
}

export default function SetPolymartIntegrationModal({
  polymartIntegration,
  onOpenChange,
  open,
}: SetPolymartIntegrationModalProps) {
  const t = useTranslations();

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [showSigningSecret, setShowSigningSecret] = useState(false);

  const form = useForm<SetPolymartIntegrationSchema>({
    resolver: zodResolver(setPolymartIntegrationSchema(t)),
    defaultValues: {
      active: true,
      webhookSecret: '',
      signingSecret: '',
    },
  });

  const { setValue, handleSubmit, reset, control } = form;

  useEffect(() => {
    if (polymartIntegration) {
      setValue('active', polymartIntegration.active);
      setValue('webhookSecret', polymartIntegration.webhookSecret);
      setValue('signingSecret', polymartIntegration.signingSecret);
    }
  }, [polymartIntegration, setValue]);

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    reset();
    if (!open) {
      setShowWebhookSecret(false);
      setShowSigningSecret(false);
    }
  };

  const handlePolymartIntegrationSet = async (
    payload: SetPolymartIntegrationSchema,
  ) => {
    const response = await fetch('/api/teams/integrations/polymart', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    return data;
  };

  const handlePolymartIntegrationDelete = async () => {
    const response = await fetch('/api/teams/integrations/polymart', {
      method: 'DELETE',
    });

    const data = await response.json();

    return data;
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await handlePolymartIntegrationDelete();
      if ('message' in res) {
        toast.error(res.message);
        return;
      }

      toast.success(t('dashboard.integrations.polymart_integration_deleted'));
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setDeleting(false);
    }
  };

  const onSubmit = async (payload: SetPolymartIntegrationSchema) => {
    setSubmitting(true);
    try {
      const res = await handlePolymartIntegrationSet(payload);
      if ('message' in res) {
        toast.error(res.message);
        return;
      }

      toast.success(
        Boolean(polymartIntegration)
          ? t('dashboard.integrations.polymart_integration_updated')
          : t('dashboard.integrations.polymart_integration_created'),
      );
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('general.copied_to_clipboard', { field: fieldName }));
    } catch (_error) {
      toast.error(t('general.error_occurred'));
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[625px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {Boolean(polymartIntegration)
              ? t('dashboard.integrations.manage_integration')
              : t('dashboard.integrations.setup_integration')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('dashboard.integrations.polymart_integration_description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <Form {...form}>
          <form
            className="space-y-4 max-md:px-2"
            onSubmit={handleSubmit(onSubmit)}
          >
            <FormField
              control={control}
              name="webhookSecret"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('dashboard.integrations.webhook_secret')}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        autoComplete="off"
                        placeholder={t('dashboard.integrations.webhook_secret')}
                        type={showWebhookSecret ? 'text' : 'password'}
                        {...field}
                      />
                      <div className="absolute bottom-1 right-1 flex space-x-1 bg-background">
                        <Button
                          className="h-7 w-7"
                          size="icon"
                          title={t('general.click_to_copy')}
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            field.value &&
                            copyToClipboard(
                              field.value,
                              t('dashboard.integrations.webhook_secret'),
                            )
                          }
                        >
                          <CopyIcon className="h-5 w-5" />
                        </Button>
                        <Button
                          className="h-7 w-7"
                          size="icon"
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setShowWebhookSecret(!showWebhookSecret)
                          }
                        >
                          {showWebhookSecret ? (
                            <EyeOffIcon className="h-5 w-5 bg-background" />
                          ) : (
                            <EyeIcon className="h-5 w-5 bg-background" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="signingSecret"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('dashboard.integrations.signing_secret')}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        autoComplete="off"
                        placeholder={t('dashboard.integrations.signing_secret')}
                        type={showSigningSecret ? 'text' : 'password'}
                        {...field}
                      />
                      <div className="absolute bottom-1 right-1 flex space-x-1 bg-background">
                        <Button
                          className="h-7 w-7"
                          size="icon"
                          title={t('general.click_to_copy')}
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            field.value &&
                            copyToClipboard(
                              field.value,
                              t('dashboard.integrations.signing_secret'),
                            )
                          }
                        >
                          <CopyIcon className="h-5 w-5" />
                        </Button>
                        <Button
                          className="h-7 w-7"
                          size="icon"
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setShowSigningSecret(!showSigningSecret)
                          }
                        >
                          {showSigningSecret ? (
                            <EyeOffIcon className="h-5 w-5 bg-background" />
                          ) : (
                            <EyeIcon className="h-5 w-5 bg-background" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t('general.active')}</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      disabled={!polymartIntegration}
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
          {Boolean(polymartIntegration) && (
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
              {Boolean(polymartIntegration)
                ? t('general.save')
                : t('general.create')}
            </LoadingButton>
          </div>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
