'use client';
import { IWebhookUpdateResponse } from '@/app/api/(dashboard)/webhooks/[slug]/route';
import { IWebhookCreateResponse } from '@/app/api/(dashboard)/webhooks/route';
import { DiscordIcon } from '@/components/shared/Icons';
import LoadingButton from '@/components/shared/LoadingButton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  SetWebhookSchema,
  setWebhookSchema,
} from '@/lib/validation/webhooks/set-webhook-schema';
import { WebhookModalContext } from '@/providers/WebhookModalProvider';
import { zodResolver } from '@hookform/resolvers/zod';
import { WebhookEventType } from '@lukittu/shared';
import { useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

function isValidDiscordWebhook(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname === 'discord.com' &&
      parsedUrl.pathname.startsWith('/api/webhooks/')
    );
  } catch {
    return false;
  }
}

export default function SetWebhookModal() {
  const t = useTranslations();
  const ctx = useContext(WebhookModalContext);
  const { mutate } = useSWRConfig();

  const [submitting, setSubmitting] = useState(false);
  const [isDiscordWebhook, setIsDiscordWebhook] = useState(false);

  const getWebhookEvents = () => [
    {
      value: WebhookEventType.LICENSE_CREATED,
      label: t('dashboard.licenses.license_created'),
    },
    {
      value: WebhookEventType.LICENSE_UPDATED,
      label: t('dashboard.licenses.license_updated'),
    },
    {
      value: WebhookEventType.LICENSE_DELETED,
      label: t('dashboard.licenses.license_deleted'),
    },
    {
      value: WebhookEventType.CUSTOMER_CREATED,
      label: t('dashboard.customers.customer_created'),
    },
    {
      value: WebhookEventType.CUSTOMER_UPDATED,
      label: t('dashboard.customers.customer_updated'),
    },
    {
      value: WebhookEventType.CUSTOMER_DELETED,
      label: t('dashboard.customers.customer_deleted'),
    },
    {
      value: WebhookEventType.PRODUCT_CREATED,
      label: t('dashboard.products.product_created'),
    },
    {
      value: WebhookEventType.PRODUCT_UPDATED,
      label: t('dashboard.products.product_updated'),
    },
    {
      value: WebhookEventType.PRODUCT_DELETED,
      label: t('dashboard.products.product_deleted'),
    },
    {
      value: WebhookEventType.RELEASE_CREATED,
      label: t('dashboard.releases.release_created'),
    },
    {
      value: WebhookEventType.RELEASE_UPDATED,
      label: t('dashboard.releases.release_updated'),
    },
    {
      value: WebhookEventType.RELEASE_DELETED,
      label: t('dashboard.releases.release_deleted'),
    },
  ];

  const form = useForm<SetWebhookSchema>({
    resolver: zodResolver(setWebhookSchema(t)),
    defaultValues: {
      name: '',
      url: '',
      active: true,
      enabledEvents: [],
    },
  });

  const { handleSubmit, setError, reset, setValue, control, getValues, watch } =
    form;

  const watchedUrl = watch('url');

  useEffect(() => {
    setIsDiscordWebhook(isValidDiscordWebhook(watchedUrl));
  }, [watchedUrl]);

  useEffect(() => {
    if (ctx.webhookToEdit) {
      setValue('name', ctx.webhookToEdit.name);
      setValue('url', ctx.webhookToEdit.url);
      setValue('active', ctx.webhookToEdit.active);
      setValue('enabledEvents', ctx.webhookToEdit.enabledEvents);
    }
  }, [ctx.webhookToEdit, setValue]);

  const handleWebhookCreate = async (payload: SetWebhookSchema) => {
    const response = await fetch('/api/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as IWebhookCreateResponse;
    return data;
  };

  const handleWebhookEdit = async (payload: SetWebhookSchema) => {
    const response = await fetch(`/api/webhooks/${ctx.webhookToEdit?.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as IWebhookUpdateResponse;
    return data;
  };

  const onSubmit = async (data: SetWebhookSchema) => {
    setSubmitting(true);
    try {
      const res = ctx.webhookToEdit
        ? await handleWebhookEdit(data)
        : await handleWebhookCreate(data);

      if ('message' in res) {
        if (res.field) {
          return setError(res.field as keyof SetWebhookSchema, {
            type: 'manual',
            message: res.message,
          });
        }

        handleOpenChange(false);
        return toast.error(res.message);
      }

      mutate((key) => Array.isArray(key) && key[0] === '/api/webhooks');

      handleOpenChange(false);
      toast.success(
        ctx.webhookToEdit
          ? t('dashboard.webhooks.webhook_updated')
          : t('dashboard.webhooks.webhook_created'),
      );
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setWebhookModalOpen(open);
    reset();
    if (!open) {
      ctx.setWebhookToEdit(null);
    }
  };

  const handleEventToggle = (eventType: WebhookEventType, checked: boolean) => {
    const currentEvents = getValues('enabledEvents');
    if (checked) {
      setValue('enabledEvents', [...currentEvents, eventType]);
    } else {
      setValue(
        'enabledEvents',
        currentEvents.filter((e) => e !== eventType),
      );
    }
  };

  const getAllEvents = () => getWebhookEvents().map((e) => e.value);

  return (
    <ResponsiveDialog
      open={ctx.webhookModalOpen}
      onOpenChange={handleOpenChange}
    >
      <ResponsiveDialogContent className="sm:max-w-[625px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {ctx.webhookToEdit
              ? t('dashboard.webhooks.edit_webhook')
              : t('dashboard.webhooks.create_webhook')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('dashboard.webhooks.webhook_description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <Form {...form}>
          <form
            className="space-y-4 max-md:px-2"
            onSubmit={handleSubmit(onSubmit)}
          >
            <FormField
              control={control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('general.name')}</FormLabel>
                  <FormControl>
                    <Input placeholder="My Webhook" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('general.url')}</FormLabel>
                  <FormControl>
                    <div className="space-y-2">
                      <Input
                        placeholder="https://api.lukittu.com/webhooks"
                        type="url"
                        {...field}
                      />
                      {isDiscordWebhook && (
                        <div className="flex items-center space-x-2 rounded-md bg-blue-50 p-2 dark:bg-blue-950">
                          <DiscordIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            {t('dashboard.webhooks.discord_webhook_detected')}
                          </span>
                        </div>
                      )}
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
                  <FormLabel>{t('general.status')}</FormLabel>
                  <FormControl>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <span className="text-sm text-muted-foreground">
                        {field.value
                          ? t('general.active')
                          : t('general.inactive')}
                      </span>
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="enabledEvents"
              render={() => (
                <FormItem>
                  <FormLabel>
                    {t('dashboard.webhooks.enabled_events')}
                  </FormLabel>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {getWebhookEvents().map((event) => (
                      <div
                        key={event.value}
                        className="flex items-center space-x-2"
                      >
                        <Checkbox
                          checked={getValues('enabledEvents').includes(
                            event.value,
                          )}
                          id={`event-${event.value}`}
                          onCheckedChange={(checked) =>
                            handleEventToggle(event.value, checked as boolean)
                          }
                        />
                        <label
                          className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          htmlFor={`event-${event.value}`}
                        >
                          {event.label}
                        </label>
                      </div>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2">
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => setValue('enabledEvents', getAllEvents())}
              >
                {t('general.select_all')}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => setValue('enabledEvents', [])}
              >
                {t('general.clear_all')}
              </Button>
            </div>

            <button className="hidden" type="submit" />
          </form>
        </Form>
        <ResponsiveDialogFooter>
          <div>
            <LoadingButton
              className="w-full"
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {t('general.close')}
            </LoadingButton>
          </div>
          <div>
            <LoadingButton
              className="w-full"
              pending={submitting}
              onClick={() => handleSubmit(onSubmit)()}
            >
              {ctx.webhookToEdit ? t('general.save') : t('general.create')}
            </LoadingButton>
          </div>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
