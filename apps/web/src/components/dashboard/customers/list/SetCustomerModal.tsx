'use client';
import { ICustomersUpdateResponse } from '@/app/api/(dashboard)/customers/[slug]/route';
import { ICustomerDiscordSearchGetResponse } from '@/app/api/(dashboard)/customers/discord-search/route';
import { ICustomersCreateResponse } from '@/app/api/(dashboard)/customers/route';
import { DiscordAccountDisplay } from '@/components/shared/discord/DiscordAccountDisplay';
import MetadataFields from '@/components/shared/form/MetadataFields';
import LoadingButton from '@/components/shared/LoadingButton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { DiscordUser } from '@/lib/providers/discord';
import {
  SetCustomerSchema,
  setCustomerSchema,
} from '@/lib/validation/customers/set-customer-schema';
import { CustomerModalContext } from '@/providers/CustomerModalProvider';
import { zodResolver } from '@hookform/resolvers/zod';
import { Address, regex } from '@lukittu/shared';
import { AlertCircle, ChevronDown, Link2, Loader2, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export default function SetCustomerModal() {
  const t = useTranslations();
  const ctx = useContext(CustomerModalContext);
  const [loading, setLoading] = useState(false);
  const [discordSearchLoading, setDiscordSearchLoading] = useState(false);
  const [discordUser, setDiscordUser] = useState<DiscordUser | null>(null);
  const [discordError, setDiscordError] = useState<string | null>(null);
  const [existingCustomer, setExistingCustomer] = useState<{
    id: string;
    fullName: string | null;
    username: string | null;
    email: string | null;
  } | null>(null);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const { mutate } = useSWRConfig();

  const form = useForm<SetCustomerSchema>({
    resolver: zodResolver(setCustomerSchema(t)),
    defaultValues: {
      email: null,
      username: null,
      fullName: null,
      discordId: null,
      address: {
        city: null,
        country: null,
        line1: null,
        line2: null,
        postalCode: null,
        state: null,
      },
      metadata: [],
    },
  });

  const { setValue, handleSubmit, reset, setError, control, watch } = form;

  const discordIdValue = watch('discordId');

  // Debounced Discord user search
  const searchDiscordUser = useCallback(
    async (discordId: string) => {
      if (
        !discordId ||
        !regex.discordId.test(discordId) ||
        discordId.length < 17
      ) {
        setDiscordUser(null);
        setDiscordError(null);
        setExistingCustomer(null);
        return;
      }

      setDiscordSearchLoading(true);
      setDiscordError(null);
      setExistingCustomer(null);

      try {
        const response = await fetch(
          `/api/customers/discord-search?discordId=${encodeURIComponent(discordId)}`,
        );

        const data =
          (await response.json()) as ICustomerDiscordSearchGetResponse;

        if ('message' in data) {
          setDiscordError(data.message);
          setDiscordUser(null);
          setExistingCustomer(null);
          return;
        }

        setDiscordUser(data.user);
        setExistingCustomer(data.existingCustomer || null);
      } catch (_error) {
        setDiscordError(t('validation.discord_api_error'));
        setDiscordUser(null);
        setExistingCustomer(null);
      } finally {
        setDiscordSearchLoading(false);
      }
    },
    [t],
  );

  // Debounce Discord search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (discordIdValue) {
        searchDiscordUser(discordIdValue);
      } else {
        setDiscordUser(null);
        setDiscordError(null);
        setExistingCustomer(null);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [discordIdValue, searchDiscordUser]);

  const hasAddressData = (address: Address | null) => {
    if (!address) return false;
    return Boolean(
      address.line1 ||
        address.city ||
        address.country ||
        address.postalCode ||
        address.state,
    );
  };

  useEffect(() => {
    if (ctx.customerToEdit) {
      setValue('email', ctx.customerToEdit?.email ?? null);
      setValue('username', ctx.customerToEdit?.username ?? null);
      setValue('fullName', ctx.customerToEdit.fullName);
      setValue(
        'discordId',
        ctx.customerToEdit.discordAccount?.discordId ?? null,
      );
      setValue('address.city', ctx.customerToEdit.address?.city ?? null);
      setValue('address.country', ctx.customerToEdit.address?.country ?? null);
      setValue('address.line1', ctx.customerToEdit.address?.line1 ?? null);
      setValue('address.line2', ctx.customerToEdit.address?.line2 ?? null);
      setValue(
        'address.postalCode',
        ctx.customerToEdit.address?.postalCode ?? null,
      );
      setValue('address.state', ctx.customerToEdit.address?.state ?? null);
      setValue(
        'metadata',
        (
          ctx.customerToEdit.metadata as {
            key: string;
            value: string;
            locked: boolean;
          }[]
        ).map((m) => ({
          key: m.key,
          value: m.value,
          locked: m.locked,
        })),
      );

      // Auto-open sections that have content
      if (ctx.customerToEdit.discordAccount?.discordId) {
        setConnectionsOpen(true);

        // Use existing Discord account data immediately
        setDiscordUser({
          id: ctx.customerToEdit.discordAccount.discordId,
          username: ctx.customerToEdit.discordAccount.username,
          avatar: ctx.customerToEdit.discordAccount.avatar,
          global_name: ctx.customerToEdit.discordAccount.globalName,
          discriminator: '', // Not stored, so leave empty
        });
      }
      if (hasAddressData(ctx.customerToEdit.address)) {
        setAddressOpen(true);
      }
    }
  }, [ctx.customerToEdit, setValue]);

  const handleCustomerCreate = async (payload: SetCustomerSchema) => {
    const response = await fetch('/api/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ICustomersCreateResponse;

    return data;
  };

  const handleCustomerEdit = async (payload: SetCustomerSchema) => {
    const response = await fetch(`/api/customers/${ctx.customerToEdit?.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ICustomersUpdateResponse;

    return data;
  };

  const onSubmit = async (data: SetCustomerSchema) => {
    setLoading(true);
    try {
      const res = ctx.customerToEdit
        ? await handleCustomerEdit(data)
        : await handleCustomerCreate(data);

      if ('message' in res) {
        if (res.field) {
          return setError(res.field as keyof SetCustomerSchema, {
            type: 'manual',
            message: res.message,
          });
        }

        handleOpenChange(false);
        return toast.error(res.message);
      }

      mutate((key) => Array.isArray(key) && key[0] === '/api/customers');
      handleOpenChange(false);
      toast.success(
        ctx.customerToEdit
          ? t('dashboard.customers.customer_updated')
          : t('dashboard.customers.customer_created'),
      );
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setCustomerModalOpen(open);
    reset();
    if (!open) {
      ctx.setCustomerToEdit(null);
      setDiscordUser(null);
      setDiscordError(null);
      setExistingCustomer(null);
      setDiscordSearchLoading(false);
      setConnectionsOpen(false);
      setAddressOpen(false);
    }
  };

  return (
    <ResponsiveDialog
      open={ctx.customerModalOpen}
      onOpenChange={handleOpenChange}
    >
      <ResponsiveDialogContent className="sm:max-w-[625px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.customers.add_customer')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('dashboard.customers.customer_description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <Form {...form}>
          <form
            className="space-y-4 max-md:px-2"
            onSubmit={handleSubmit(onSubmit)}
          >
            <FormField
              control={control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('general.email')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="support@lukittu.com"
                      type="email"
                      {...field}
                      value={field.value ?? ''}
                      required
                      onChange={(e) => {
                        if (!e.target.value) {
                          return setValue('email', null);
                        }
                        return setValue('email', e.target.value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('general.username')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Lukittu"
                      type="username"
                      {...field}
                      value={field.value ?? ''}
                      required
                      onChange={(e) => {
                        if (!e.target.value) {
                          return setValue('username', null);
                        }
                        return setValue('username', e.target.value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('general.full_name')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        if (!e.target.value) {
                          return setValue('fullName', null);
                        }
                        return setValue('fullName', e.target.value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <Collapsible
              open={connectionsOpen}
              onOpenChange={setConnectionsOpen}
            >
              <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between rounded-lg border border-input bg-background px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/50 transition-colors group-hover:bg-muted">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">
                      {t('dashboard.customers.connections')}
                    </span>
                    {(discordUser || ctx.customerToEdit?.discordAccount) && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        <span className="text-sm font-medium text-muted-foreground">
                          {t('general.connected')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                    connectionsOpen ? 'rotate-180' : ''
                  }`}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <FormField
                  control={control}
                  name="discordId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        {t('dashboard.customers.discord_id')}
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            placeholder="123456789012345678"
                            value={field.value ?? ''}
                            onChange={(e) => {
                              if (!e.target.value) {
                                return setValue('discordId', null);
                              }
                              return setValue('discordId', e.target.value);
                            }}
                          />
                          {discordSearchLoading && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {discordUser && (
                  <Card>
                    <CardContent className="p-4">
                      <DiscordAccountDisplay
                        discordAccount={{
                          discordId: discordUser.id,
                          username: discordUser.username,
                          avatar: discordUser.avatar,
                          globalName: discordUser.global_name,
                        }}
                        size="lg"
                      />
                    </CardContent>
                  </Card>
                )}
                {existingCustomer &&
                  existingCustomer.id !== ctx.customerToEdit?.id && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            {t('validation.discord_account_already_linked')}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t.rich(
                              'dashboard.customers.discord_account_linked_to',
                              {
                                customerName:
                                  existingCustomer.fullName ||
                                  existingCustomer.username ||
                                  existingCustomer.email ||
                                  'Unknown Customer',
                                link: (child) => (
                                  <Link
                                    className="font-medium text-primary underline hover:text-primary/80"
                                    href={`/dashboard/customers/${existingCustomer.id}`}
                                    rel="noopener noreferrer"
                                    target="_blank"
                                  >
                                    {child}
                                  </Link>
                                ),
                              },
                            )}
                          </p>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                {discordError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{discordError}</AlertDescription>
                  </Alert>
                )}
                {discordSearchLoading && !discordUser && !discordError && (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CollapsibleContent>
            </Collapsible>
            <Collapsible open={addressOpen} onOpenChange={setAddressOpen}>
              <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between rounded-lg border border-input bg-background px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/50 transition-colors group-hover:bg-muted">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">
                      {t('dashboard.customers.address_details')}
                    </span>
                    {hasAddressData(ctx.customerToEdit?.address || null) && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        <span className="text-sm font-medium text-muted-foreground">
                          {t('dashboard.customers.address_added')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                    addressOpen ? 'rotate-180' : ''
                  }`}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-1">
                    <FormField
                      control={control}
                      name="address.line1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('general.address_line1')}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                if (!e.target.value) {
                                  return setValue('address.line1', null);
                                }
                                return setValue(
                                  'address.line1',
                                  e.target.value,
                                );
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="address.line2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('general.address_line2')}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                if (!e.target.value) {
                                  return setValue('address.line2', null);
                                }
                                return setValue(
                                  'address.line2',
                                  e.target.value,
                                );
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={control}
                      name="address.city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('general.city')}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                if (!e.target.value) {
                                  return setValue('address.city', null);
                                }
                                return setValue('address.city', e.target.value);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="address.state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('general.state')}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                if (!e.target.value) {
                                  return setValue('address.state', null);
                                }
                                return setValue(
                                  'address.state',
                                  e.target.value,
                                );
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="address.postalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('general.postal_code')}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                if (!e.target.value) {
                                  return setValue('address.postalCode', null);
                                }
                                return setValue(
                                  'address.postalCode',
                                  e.target.value,
                                );
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="address.country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('general.country')}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                if (!e.target.value) {
                                  return setValue('address.country', null);
                                }
                                return setValue(
                                  'address.country',
                                  e.target.value,
                                );
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
            <MetadataFields form={form} />
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
              onClick={() => handleSubmit(onSubmit)()}
            >
              {t('dashboard.customers.add_customer')}
            </LoadingButton>
          </div>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
