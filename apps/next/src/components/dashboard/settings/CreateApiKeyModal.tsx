import { ITeamsCreateApiKeyResponse } from '@/app/api/(dashboard)/teams/api-key/route';
import LoadingButton from '@/components/shared/LoadingButton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Form,
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { cn } from '@/lib/utils/tailwind-helpers';
import {
  CreateApiKeySchema,
  createApiKeySchema,
} from '@/lib/validation/team/create-api-key-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarIcon, Copy, TriangleAlert, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

interface CreateApiKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: any;
}

export function CreateApiKeyModal({
  open,
  onOpenChange,
  team,
}: CreateApiKeyModalProps) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const locale = useLocale();
  const { mutate } = useSWRConfig();

  const form = useForm<CreateApiKeySchema>({
    resolver: zodResolver(createApiKeySchema(t)),
    defaultValues: {
      expiresAt: null,
    },
  });

  const expiresAt = form.watch('expiresAt');

  const handleApiKeyCreate = async (payload: CreateApiKeySchema) => {
    const response = await fetch('/api/teams/api-key', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ITeamsCreateApiKeyResponse;

    return data;
  };

  const onSubmit = async (data: CreateApiKeySchema) => {
    setLoading(true);
    try {
      const res = await handleApiKeyCreate(data);

      if ('message' in res) {
        if (res.field) {
          return form.setError(res.field as keyof CreateApiKeySchema, {
            type: 'manual',
            message: res.message,
          });
        }

        handleClose(false);
        return toast.error(res.message);
      }

      setApiKey(res.apiKey);
      mutate((key) => Array.isArray(key) && key[0] === '/api/teams');
      toast.success(t('dashboard.settings.api_key_created'));
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!apiKey) return;

    try {
      await navigator.clipboard.writeText(apiKey);
      toast.success(t('general.copied_to_clipboard'));
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleClose = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setApiKey(null);
      form.reset();
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleClose}>
      <ResponsiveDialogContent className="sm:max-w-[625px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.settings.create_api_key')}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        {!apiKey && (
          <Form {...form}>
            <form
              className="space-y-4 max-md:px-2"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <FormItem className="flex flex-col">
                <FormLabel>{t('dashboard.licenses.expiration_date')}</FormLabel>
                <FormControl>
                  <div className="relative w-full">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !expiresAt && 'text-muted-foreground',
                          )}
                          variant="outline"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {expiresAt ? (
                            new Intl.DateTimeFormat(locale, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            }).format(expiresAt)
                          ) : (
                            <span>{t('general.expires_at')}</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          fromDate={new Date()}
                          mode="single"
                          selected={expiresAt ?? undefined}
                          initialFocus
                          onSelect={(date) => {
                            form.setValue('expiresAt', date ?? null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={() => form.setValue('expiresAt', null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </FormControl>
                <FormDescription>
                  {t('dashboard.settings.api_key_expiration_date_description')}
                </FormDescription>
              </FormItem>
              <button className="hidden" type="submit" />
            </form>
          </Form>
        )}
        {apiKey ? (
          <>
            <Alert>
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>{t('dashboard.settings.api_key_created')}</AlertTitle>
              <AlertDescription>
                {t.rich('dashboard.settings.api_key_created_description', {
                  strong: (children) => <strong>{children}</strong>,
                })}
              </AlertDescription>
            </Alert>
            <div className="relative">
              <Input value={apiKey} readOnly />
              <Button
                className="absolute right-0 top-1/2 -translate-y-1/2"
                size="sm"
                variant="ghost"
                onClick={copyToClipboard}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : null}
        <ResponsiveDialogFooter>
          <LoadingButton variant="outline" onClick={() => handleClose(false)}>
            {t('general.close')}
          </LoadingButton>
          {!apiKey && (
            <LoadingButton
              pending={loading}
              onClick={() => form.handleSubmit(onSubmit)()}
            >
              {t('general.create')}
            </LoadingButton>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
