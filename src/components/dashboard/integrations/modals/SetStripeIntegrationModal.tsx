import { ITeamsIntegrationsGetSuccessResponse } from '@/app/api/(dashboard)/teams/integrations/route';
import { ITeamsIntegrationsStripeSetResponse } from '@/app/api/(dashboard)/teams/integrations/stripe/route';
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
  SetStripeIntegrationSchema,
  setStripeIntegrationSchema,
} from '@/lib/validation/integrations/set-stripe-integration-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface SetStripeIntegrationModalProps {
  stripeIntegration: ITeamsIntegrationsGetSuccessResponse['integrations']['stripeIntegration'];
  open: boolean;
  onOpenChange: (boolean: boolean) => void;
}

export default function SetStripeIntegrationModal({
  stripeIntegration,
  onOpenChange,
  open,
}: SetStripeIntegrationModalProps) {
  const t = useTranslations();

  const [loading, setLoading] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const form = useForm<SetStripeIntegrationSchema>({
    resolver: zodResolver(setStripeIntegrationSchema(t)),
    defaultValues: {
      active: true,
      apiKey: '',
      webhookSecret: '',
    },
  });

  useEffect(() => {
    if (stripeIntegration) {
      form.setValue('active', stripeIntegration.active);
      form.setValue('apiKey', stripeIntegration.apiKey);
      form.setValue('webhookSecret', stripeIntegration.webhookSecret);
    }
  }, [stripeIntegration, form, open]);

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    form.reset();
  };

  const handleStripeIntegrationSet = async (
    payload: SetStripeIntegrationSchema,
  ) => {
    const response = await fetch('/api/teams/integrations/stripe', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ITeamsIntegrationsStripeSetResponse;

    return data;
  };

  const onSubmit = async (payload: SetStripeIntegrationSchema) => {
    setLoading(true);
    try {
      const res = await handleStripeIntegrationSet(payload);
      if ('message' in res) {
        toast.error(res.message);
        return;
      }

      toast.success(
        Boolean(stripeIntegration)
          ? t('dashboard.integrations.stripe_integration_updated')
          : t('dashboard.integrations.stripe_integration_created'),
      );
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[625px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {Boolean(stripeIntegration)
              ? t('dashboard.integrations.manage_integration')
              : t('dashboard.integrations.setup_integration')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('dashboard.integrations.stripe_integration_description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <Form {...form}>
          <form
            className="space-y-4 max-md:px-2"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('general.api_key')}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        autoComplete="off"
                        placeholder="sk_test_..."
                        type={showApiKey ? 'text' : 'password'}
                        {...field}
                      />
                      <Button
                        className="absolute bottom-1 right-1 h-7 w-7"
                        size="icon"
                        type="button"
                        variant="ghost"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? (
                          <EyeOffIcon className="bg-background" />
                        ) : (
                          <EyeIcon className="bg-background" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
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
                        placeholder="whsec_..."
                        type={showWebhookSecret ? 'text' : 'password'}
                        {...field}
                      />
                      <Button
                        className="absolute bottom-1 right-1 h-7 w-7"
                        size="icon"
                        type="button"
                        variant="ghost"
                        onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                      >
                        {showWebhookSecret ? (
                          <EyeOffIcon className="bg-background" />
                        ) : (
                          <EyeIcon className="bg-background" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t('general.active')}</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      disabled={!stripeIntegration}
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
          <div>
            <LoadingButton
              className="w-full"
              pending={loading}
              type="submit"
              onClick={() => form.handleSubmit(onSubmit)()}
            >
              {Boolean(stripeIntegration)
                ? t('general.edit')
                : t('general.create')}
            </LoadingButton>
          </div>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
