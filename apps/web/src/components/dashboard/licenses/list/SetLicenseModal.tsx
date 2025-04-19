'use client';
import { ILicensesUpdateResponse } from '@/app/api/(dashboard)/licenses/[slug]/route';
import { ILicensesGenerateResponse } from '@/app/api/(dashboard)/licenses/generate/route';
import { ILicensesCreateResponse } from '@/app/api/(dashboard)/licenses/route';
import { CustomersMultiselect } from '@/components/shared/form/CustomersMultiselect';
import MetadataFields from '@/components/shared/form/MetadataFields';
import { ProductsMultiselect } from '@/components/shared/form/ProductsMultiselect';
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
import { DateTimePicker } from '@/components/ui/date-time-picker';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils/tailwind-helpers';
import {
  SetLicenseScheama,
  setLicenseSchema,
} from '@/lib/validation/licenses/set-license-schema';
import { LicenseModalContext } from '@/providers/LicenseModalProvider';
import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar, Clock, Infinity, RefreshCw, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export default function SetLicenseModal() {
  const t = useTranslations();
  const locale = useLocale();
  const ctx = useContext(LicenseModalContext);
  const { mutate } = useSWRConfig();

  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState<{
    license: boolean;
    product: boolean;
  }>({
    license: false,
    product: false,
  });

  const [removingProduct, setRemovingProduct] = useState<string | null>(null);
  const [removingCustomer, setRemovingCustomer] = useState<string | null>(null);
  const [pendingProductIds, setPendingProductIds] = useState<string[]>([]);
  const [pendingCustomerIds, setPendingCustomerIds] = useState<string[]>([]);

  const form = useForm<SetLicenseScheama>({
    resolver: zodResolver(setLicenseSchema(t)),
    defaultValues: {
      suspended: false,
      licenseKey: '',
      productIds: [],
      customerIds: [],
      expirationDate: null,
      expirationDays: null,
      expirationStart: null,
      ipLimit: null,
      seats: null,
      expirationType: 'NEVER',
      metadata: [],
      sendEmailDelivery: false,
    },
  });

  const { handleSubmit, setError, reset, setValue, getValues, watch, control } =
    form;

  const expirationType = useWatch({
    control,
    name: 'expirationType',
    defaultValue: 'NEVER',
  });

  useEffect(() => {
    if (ctx.licenseToEdit) {
      setValue('suspended', ctx.licenseToEdit.suspended);
      setValue('licenseKey', ctx.licenseToEdit.licenseKey);
      setValue(
        'productIds',
        ctx.licenseToEdit.products.map((p) => p.id),
      );
      setValue(
        'customerIds',
        ctx.licenseToEdit.customers.map((c) => c.id),
      );
      setValue('expirationType', ctx.licenseToEdit.expirationType);

      if (ctx.licenseToEdit.expirationType === 'DATE') {
        setValue(
          'expirationDate',
          ctx.licenseToEdit.expirationDate
            ? new Date(ctx.licenseToEdit.expirationDate)
            : null,
        );
      }

      if (ctx.licenseToEdit.expirationType === 'DURATION') {
        setValue('expirationStart', ctx.licenseToEdit.expirationStart);
        setValue('expirationDays', ctx.licenseToEdit.expirationDays);
      }

      setValue('seats', ctx.licenseToEdit.seats);
      setValue('ipLimit', ctx.licenseToEdit.ipLimit);
      setValue(
        'metadata',
        (
          ctx.licenseToEdit.metadata as {
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
    }
  }, [ctx.licenseToEdit, setValue]);

  useEffect(() => {
    if (ctx.licenseModalOpen && !ctx.licenseToEdit) {
      if (ctx.initialProductIds.length > 0) {
        setValue('productIds', ctx.initialProductIds, {
          shouldValidate: true,
        });
      }
      if (ctx.initialCustomerIds.length > 0) {
        setValue('customerIds', ctx.initialCustomerIds, {
          shouldValidate: true,
        });
      }
    }
  }, [
    ctx.licenseModalOpen,
    ctx.licenseToEdit,
    ctx.initialProductIds,
    ctx.initialCustomerIds,
    setValue,
  ]);

  const handleLicenseGenerate = async () => {
    setLoading((prev) => ({ ...prev, license: true }));
    try {
      const response = await fetch('/api/licenses/generate');
      const data = (await response.json()) as ILicensesGenerateResponse;
      const licenseKey = data.licenseKey;
      setValue('licenseKey', licenseKey, { shouldValidate: true });
    } catch (error: any) {
      toast.error(error.message ?? t('general.server_error'));
    } finally {
      setLoading((prev) => ({ ...prev, license: false }));
    }
  };

  const handleLicenseCreate = async (payload: SetLicenseScheama) => {
    const response = await fetch('/api/licenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ILicensesCreateResponse;

    return data;
  };

  const handleLicenseEdit = async (payload: SetLicenseScheama) => {
    const response = await fetch(`/api/licenses/${ctx.licenseToEdit?.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ILicensesUpdateResponse;

    return data;
  };

  const handleExpirationTypeChange = (type: 'NEVER' | 'DATE' | 'DURATION') => {
    setValue('expirationType', type);
    if (type === 'NEVER') {
      setValue('expirationDate', null);
      setValue('expirationDays', null);
      setValue('expirationStart', null);
    }
    if (type === 'DATE') {
      setValue('expirationDays', null);
      setValue('expirationStart', null);
    }
    if (type === 'DURATION') {
      setValue('expirationStart', 'CREATION');
      setValue('expirationDate', null);
    }
  };

  const onSubmit = async (data: SetLicenseScheama) => {
    setSubmitting(true);
    try {
      const res = ctx.licenseToEdit
        ? await handleLicenseEdit(data)
        : await handleLicenseCreate(data);

      if ('message' in res) {
        if (res.field) {
          return setError(res.field as keyof SetLicenseScheama, {
            type: 'manual',
            message: res.message,
          });
        }

        handleOpenChange(false);
        return toast.error(res.message);
      }

      mutate((key) => Array.isArray(key) && key[0] === '/api/licenses');
      mutate((key) => Array.isArray(key) && key[0] === '/api/products');
      mutate((key) => Array.isArray(key) && key[0] === '/api/customers');

      handleOpenChange(false);
      toast.success(
        ctx.licenseToEdit
          ? t('dashboard.licenses.license_updated')
          : t('dashboard.licenses.license_created'),
      );
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setLicenseModalOpen(open);
    reset();
    if (!open) {
      ctx.setLicenseToEdit(null);
    }
  };

  const handleProductChange = (productIds: string[], isClear?: boolean) => {
    const currentIds = getValues('productIds');

    if (isClear && currentIds.length > 0) {
      setRemovingProduct('all');
      setPendingProductIds([]);
      return;
    }

    const removedId = currentIds.find((id) => !productIds.includes(id));
    if (removedId && productIds.length < currentIds.length) {
      setRemovingProduct(removedId);
      setPendingProductIds(productIds);
    } else {
      setValue('productIds', productIds);
    }
  };

  const handleCustomerChange = (customerIds: string[], isClear?: boolean) => {
    const currentIds = getValues('customerIds');

    if (isClear && currentIds.length > 0) {
      setRemovingCustomer('all');
      setPendingCustomerIds([]);
      return;
    }

    const removedId = currentIds.find((id) => !customerIds.includes(id));
    if (removedId && customerIds.length < currentIds.length) {
      setRemovingCustomer(removedId);
      setPendingCustomerIds(customerIds);
    } else {
      setValue('customerIds', customerIds);
    }
  };

  const handleProductRemoveConfirm = () => {
    if (removingProduct) {
      setValue('productIds', pendingProductIds);
      setRemovingProduct(null);
      setPendingProductIds([]);
    }
  };

  const handleCustomerRemoveConfirm = () => {
    if (removingCustomer) {
      setValue('customerIds', pendingCustomerIds);
      setRemovingCustomer(null);
      setPendingCustomerIds([]);
    }
  };

  const handleProductRemoveCancel = () => {
    setRemovingProduct(null);
    setPendingProductIds([]);
  };

  const handleCustomerRemoveCancel = () => {
    setRemovingCustomer(null);
    setPendingCustomerIds([]);
  };

  return (
    <>
      <ResponsiveDialog
        open={ctx.licenseModalOpen}
        onOpenChange={handleOpenChange}
      >
        <ResponsiveDialogContent className="sm:max-w-[625px]">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t('dashboard.licenses.add_license')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t('dashboard.products.product_description')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <Form {...form}>
            <form
              className="space-y-4 max-md:px-2"
              onSubmit={handleSubmit(onSubmit)}
            >
              <FormField
                control={control}
                name="licenseKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('general.license')}</FormLabel>
                    <FormControl>
                      <div className="relative w-full">
                        <Input
                          disabled={loading.license}
                          placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                          {...field}
                        />
                        <Button
                          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                          disabled={loading.license}
                          size="icon"
                          type="button"
                          variant="ghost"
                          onClick={handleLicenseGenerate}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <FormLabel>{t('dashboard.licenses.expiration_type')}</FormLabel>
                <div className="flex gap-2">
                  <Button
                    className={cn(
                      'w-full gap-2',
                      expirationType === 'NEVER' && 'border-2 border-primary',
                    )}
                    type="button"
                    variant="outline"
                    onClick={() => handleExpirationTypeChange('NEVER')}
                  >
                    <Infinity className="h-4 w-4" />
                    {t('general.never')}
                  </Button>
                  <Button
                    className={cn(
                      'w-full gap-2',
                      expirationType === 'DATE' && 'border-2 border-primary',
                    )}
                    type="button"
                    variant="outline"
                    onClick={() => handleExpirationTypeChange('DATE')}
                  >
                    <Calendar className="h-4 w-4" />
                    {t('general.date')}
                  </Button>
                  <Button
                    className={cn(
                      'w-full gap-2',
                      expirationType === 'DURATION' &&
                        'border-2 border-primary',
                    )}
                    type="button"
                    variant="outline"
                    onClick={() => handleExpirationTypeChange('DURATION')}
                  >
                    <Clock className="h-4 w-4" />
                    {t('general.duration')}
                  </Button>
                </div>
              </div>
              {expirationType === 'DATE' && (
                <FormField
                  control={control}
                  name="expirationDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>
                        {t('dashboard.licenses.expiration_date')}
                      </FormLabel>
                      <FormControl>
                        <div className="relative w-full">
                          <DateTimePicker
                            granularity="minute"
                            hourCycle={locale === 'en' ? 12 : 24}
                            placeholder={t(
                              'dashboard.licenses.expiration_date',
                            )}
                            value={field.value ?? undefined}
                            onChange={(date) => {
                              if (!date) {
                                return setValue('expirationDate', null);
                              }
                              setValue('expirationDate', date);
                            }}
                          />
                          <Button
                            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                            size="icon"
                            type="button"
                            variant="ghost"
                            onClick={() => setValue('expirationDate', null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {expirationType === 'DURATION' && (
                <>
                  <FormField
                    control={control}
                    name="expirationStart"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('dashboard.licenses.expiration_start')}
                        </FormLabel>
                        <Select
                          value={field.value ?? 'CREATION'}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={t(
                                  'dashboard.licenses.select_expiration_start',
                                )}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="CREATION">
                              {t('dashboard.licenses.creation')}
                            </SelectItem>
                            <SelectItem value="ACTIVATION">
                              {t('dashboard.licenses.activation')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name="expirationDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('dashboard.licenses.expiration_days')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            min={1}
                            placeholder={t(
                              'dashboard.licenses.expiration_days',
                            )}
                            type="number"
                            value={field.value ?? ''}
                            onChange={(e) => {
                              if (!e.target.value || e.target.value === '0') {
                                return setValue('expirationDays', null);
                              }
                              setValue('expirationDays', +e.target.value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              <FormField
                control={control}
                name="ipLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('dashboard.licenses.ip_limit')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        min={1}
                        placeholder={t('dashboard.licenses.ip_limit')}
                        type="number"
                        value={field.value ?? ''}
                        onChange={(e) => {
                          if (!e.target.value || e.target.value === '0') {
                            return setValue('ipLimit', null);
                          }
                          setValue('ipLimit', +e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="seats"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('dashboard.licenses.concurrent_users')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        min={1}
                        placeholder={t('dashboard.licenses.concurrent_users')}
                        type="number"
                        value={field.value ?? ''}
                        onChange={(e) => {
                          if (!e.target.value || e.target.value === '0') {
                            return setValue('seats', null);
                          }
                          setValue('seats', +e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>
                  {t('dashboard.licenses.assigned_products')}
                </FormLabel>
                <ProductsMultiselect
                  selectedProducts={ctx.licenseToEdit?.products}
                  value={watch('productIds')}
                  onChange={handleProductChange}
                />
              </FormItem>

              <FormItem>
                <FormLabel>
                  {t('dashboard.licenses.assigned_customers')}
                </FormLabel>
                <CustomersMultiselect
                  selectedCustomers={ctx.licenseToEdit?.customers}
                  value={watch('customerIds')}
                  onChange={handleCustomerChange}
                />
              </FormItem>
              <FormField
                control={control}
                name="suspended"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t('general.suspended')}</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
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
                disabled={loading.license || loading.product}
                pending={submitting}
                onClick={() => handleSubmit(onSubmit)()}
              >
                {ctx.licenseToEdit
                  ? t('dashboard.licenses.edit_license')
                  : t('dashboard.licenses.add_license')}
              </LoadingButton>
            </div>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <AlertDialog
        open={removingProduct !== null}
        onOpenChange={handleProductRemoveCancel}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('dashboard.licenses.remove_product')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('dashboard.licenses.remove_product_warning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('general.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleProductRemoveConfirm}>
              {t('general.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removingCustomer !== null}
        onOpenChange={handleCustomerRemoveCancel}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('dashboard.licenses.remove_customer')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('dashboard.licenses.remove_customer_warning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('general.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCustomerRemoveConfirm}>
              {t('general.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
