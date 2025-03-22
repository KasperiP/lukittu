import { ITeamsIntegrationsGetSuccessResponse } from '@/app/api/(dashboard)/teams/integrations/route';
import LoadingButton from '@/components/shared/LoadingButton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  SetBuildByBitIntegrationSchema,
  setBuildByBitIntegrationSchema,
} from '@/lib/validation/integrations/set-buildbybit-integration-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { CopyIcon, EyeIcon, EyeOffIcon, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface SetBuildByBitIntegrationModalProps {
  buildByBitIntegration: ITeamsIntegrationsGetSuccessResponse['integrations']['buildByBitIntegration'];
  open: boolean;
  onOpenChange: (boolean: boolean) => void;
}

export default function SetBuildByBitIntegrationModal({
  buildByBitIntegration,
  onOpenChange,
  open,
}: SetBuildByBitIntegrationModalProps) {
  const t = useTranslations();

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [generatedApiSecret, setGeneratedApiSecret] = useState('');
  const [showConfirmReroll, setShowConfirmReroll] = useState(false);

  const form = useForm<SetBuildByBitIntegrationSchema>({
    resolver: zodResolver(setBuildByBitIntegrationSchema(t)),
    defaultValues: {
      active: true,
      apiSecret: '',
    },
  });

  const generateBuildByBitApiSecret = () => {
    const characters =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'bbb_';
    for (let i = 0; i < 64; i++) {
      result += characters.charAt(
        Math.floor(Math.random() * characters.length),
      );
    }
    return result;
  };

  const { setValue, handleSubmit, reset, control } = form;

  useEffect(() => {
    // Generate a new API secret when the modal is opened and there's no existing integration
    if (open && !buildByBitIntegration) {
      const newSecret = generateBuildByBitApiSecret();
      setGeneratedApiSecret(newSecret);
      setValue('apiSecret', newSecret);
    } else if (buildByBitIntegration) {
      setValue('active', buildByBitIntegration.active);
      setValue('apiSecret', buildByBitIntegration.apiSecret);
      setGeneratedApiSecret(buildByBitIntegration.apiSecret);
    }
  }, [buildByBitIntegration, open, setValue]);

  const handleRerollApiSecret = () => {
    const newSecret = generateBuildByBitApiSecret();
    setGeneratedApiSecret(newSecret);
    setValue('apiSecret', newSecret);
    setShowConfirmReroll(false);
  };

  const openRerollConfirmation = () => {
    setShowConfirmReroll(true);
  };

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    reset();
    if (!open) {
      setShowApiSecret(false);
    }
  };

  const handleBuildByBitIntegrationSet = async (
    payload: SetBuildByBitIntegrationSchema,
  ) => {
    const response = await fetch('/api/teams/integrations/buildbybit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    return data;
  };

  const handleBuildByBitIntegrationDelete = async () => {
    const response = await fetch('/api/teams/integrations/buildbybit', {
      method: 'DELETE',
    });

    const data = await response.json();

    return data;
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await handleBuildByBitIntegrationDelete();
      if ('message' in res) {
        toast.error(res.message);
        return;
      }

      toast.success(t('dashboard.integrations.buildbybit_integration_deleted'));
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setDeleting(false);
    }
  };

  const onSubmit = async (payload: SetBuildByBitIntegrationSchema) => {
    setSubmitting(true);
    try {
      const res = await handleBuildByBitIntegrationSet(payload);
      if ('message' in res) {
        toast.error(res.message);
        return;
      }

      toast.success(
        Boolean(buildByBitIntegration)
          ? t('dashboard.integrations.buildbybit_integration_updated')
          : t('dashboard.integrations.buildbybit_integration_created'),
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
    } catch (err) {
      toast.error(t('general.error_occurred'));
    }
  };

  return (
    <>
      <AlertDialog open={showConfirmReroll} onOpenChange={setShowConfirmReroll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('dashboard.integrations.reroll_secret')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('dashboard.integrations.reroll_secret_warning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('general.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRerollApiSecret}>
              {t('dashboard.integrations.reset_secret')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
        <ResponsiveDialogContent className="sm:max-w-[625px]">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {Boolean(buildByBitIntegration)
                ? t('dashboard.integrations.manage_integration')
                : t('dashboard.integrations.setup_integration')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t('dashboard.integrations.buildbybit_integration_description')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <Form {...form}>
            <form
              className="space-y-4 max-md:px-2"
              onSubmit={handleSubmit(onSubmit)}
            >
              <FormField
                control={control}
                name="apiSecret"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('general.api_secret')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          autoComplete="off"
                          placeholder="bbb_..."
                          type={showApiSecret ? 'text' : 'password'}
                          value={generatedApiSecret}
                          readOnly
                          onChange={(e) => {
                            field.onChange(e);
                          }}
                        />
                        <div className="absolute bottom-1 right-1 flex space-x-1 bg-background">
                          <Button
                            className="h-7 w-7"
                            size="icon"
                            title={t(
                              'dashboard.integrations.regenerate_secret',
                            )}
                            type="button"
                            variant="ghost"
                            onClick={openRerollConfirmation}
                          >
                            <RefreshCw className="h-5 w-5 bg-background" />
                          </Button>
                          <Button
                            className="h-7 w-7"
                            size="icon"
                            title={t('general.click_to_copy')}
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              copyToClipboard(
                                generatedApiSecret,
                                t('general.api_secret'),
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
                            onClick={() => setShowApiSecret(!showApiSecret)}
                          >
                            {showApiSecret ? (
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
                        disabled={!buildByBitIntegration}
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
            {Boolean(buildByBitIntegration) && (
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
                {Boolean(buildByBitIntegration)
                  ? t('general.save')
                  : t('general.create')}
              </LoadingButton>
            </div>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
