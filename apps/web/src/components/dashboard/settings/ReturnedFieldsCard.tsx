'use client';

import {
  IMetadataGetResponse,
  IMetadataGetSuccessResponse,
} from '@/app/api/(dashboard)/metadata/route';
import { ITeamGetSuccessResponse } from '@/app/api/(dashboard)/teams/[slug]/route';
import LoadingButton from '@/components/shared/LoadingButton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandGroup, CommandItem } from '@/components/ui/command';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  SetReturnedFieldsSchema,
  setReturnedFieldsSchema,
} from '@/lib/validation/team/set-returned-fields-schema';
import { TeamContext } from '@/providers/TeamProvider';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Save, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import useSWR from 'swr';

interface ReturnedFieldsCardProps {
  team: ITeamGetSuccessResponse['team'] | null;
}

const fetchMetadata = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IMetadataGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function ReturnedFieldsCard({ team }: ReturnedFieldsCardProps) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [newLicenseKey, setNewLicenseKey] = useState('');
  const [newCustomerKey, setNewCustomerKey] = useState('');
  const [newProductKey, setNewProductKey] = useState('');
  const [showLicenseSuggestions, setShowLicenseSuggestions] = useState(false);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const teamCtx = useContext(TeamContext);

  const { data } = useSWR<IMetadataGetSuccessResponse>(
    teamCtx.selectedTeam ? ['/api/metadata', teamCtx.selectedTeam] : null,
    ([url, _]) => fetchMetadata(url),
  );

  const existingMetadataKeys = data?.metadata.map((m) => m.key) || [];

  const form = useForm<SetReturnedFieldsSchema>({
    resolver: zodResolver(setReturnedFieldsSchema(t)),
    defaultValues: {
      licenseIpLimit: team?.settings?.returnedFields?.licenseIpLimit || false,
      licenseSeats: team?.settings?.returnedFields?.licenseSeats || false,
      licenseExpirationType:
        team?.settings?.returnedFields?.licenseExpirationType || false,
      licenseExpirationStart:
        team?.settings?.returnedFields?.licenseExpirationStart || false,
      licenseExpirationDate:
        team?.settings?.returnedFields?.licenseExpirationDate || false,
      licenseExpirationDays:
        team?.settings?.returnedFields?.licenseExpirationDays || false,
      licenseMetadataKeys:
        team?.settings?.returnedFields?.licenseMetadataKeys || [],
      customerEmail: team?.settings?.returnedFields?.customerEmail || false,
      customerFullName:
        team?.settings?.returnedFields?.customerFullName || false,
      customerUsername:
        team?.settings?.returnedFields?.customerUsername || false,
      customerMetadataKeys:
        team?.settings?.returnedFields?.customerMetadataKeys || [],
      productName: team?.settings?.returnedFields?.productName || false,
      productUrl: team?.settings?.returnedFields?.productUrl || false,
      productMetadataKeys:
        team?.settings?.returnedFields?.productMetadataKeys || [],
    },
  });

  const { control, handleSubmit, watch, setValue } = form;

  const licenseMetadataKeys = watch('licenseMetadataKeys');
  const customerMetadataKeys = watch('customerMetadataKeys');
  const productMetadataKeys = watch('productMetadataKeys');

  const addLicenseMetadataKey = () => {
    if (!newLicenseKey || licenseMetadataKeys.includes(newLicenseKey)) return;
    setValue('licenseMetadataKeys', [...licenseMetadataKeys, newLicenseKey], {
      shouldValidate: true,
      shouldDirty: true,
    });
    setNewLicenseKey('');
  };

  const removeLicenseMetadataKey = (key: string) => {
    setValue(
      'licenseMetadataKeys',
      licenseMetadataKeys.filter((k) => k !== key),
      { shouldValidate: true, shouldDirty: true },
    );
  };

  const addCustomerMetadataKey = () => {
    if (!newCustomerKey || customerMetadataKeys.includes(newCustomerKey))
      return;
    setValue(
      'customerMetadataKeys',
      [...customerMetadataKeys, newCustomerKey],
      {
        shouldValidate: true,
        shouldDirty: true,
      },
    );
    setNewCustomerKey('');
  };

  const removeCustomerMetadataKey = (key: string) => {
    setValue(
      'customerMetadataKeys',
      customerMetadataKeys.filter((k) => k !== key),
      { shouldValidate: true, shouldDirty: true },
    );
  };

  const addProductMetadataKey = () => {
    if (!newProductKey || productMetadataKeys.includes(newProductKey)) return;
    setValue('productMetadataKeys', [...productMetadataKeys, newProductKey], {
      shouldValidate: true,
      shouldDirty: true,
    });
    setNewProductKey('');
  };

  const removeProductMetadataKey = (key: string) => {
    setValue(
      'productMetadataKeys',
      productMetadataKeys.filter((k) => k !== key),
      { shouldValidate: true, shouldDirty: true },
    );
  };

  const onSubmit = async (data: SetReturnedFieldsSchema) => {
    setLoading(true);
    try {
      const response = await fetch('/api/teams/settings/returned-fields', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if ('message' in result && 'error' in result) {
        toast.error(result.message);
      } else {
        toast.success(t('dashboard.settings.returned_fields_updated'));
      }
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  // Helper function to filter suggestions based on input
  const getFilteredSuggestions = (input: string) => {
    if (!input) return [];

    return existingMetadataKeys.filter(
      (key) =>
        key.toLowerCase().includes(input.toLowerCase()) &&
        key.toLowerCase() !== input.toLowerCase(),
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center text-xl font-bold">
          {t('dashboard.settings.returned_fields')}
        </CardTitle>
        <CardDescription>
          {t('dashboard.settings.returned_fields_description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <Accordion
              className="w-full"
              defaultValue={['license', 'customer', 'product']}
              type="multiple"
            >
              {/* License Fields */}
              <AccordionItem value="license">
                <AccordionTrigger className="text-md font-semibold">
                  {t('dashboard.settings.license_fields')}
                </AccordionTrigger>
                <AccordionContent allowOverflow>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FormField
                        control={control}
                        name="licenseIpLimit"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                id="licenseIpLimit"
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel htmlFor="licenseIpLimit">
                              {t('dashboard.licenses.ip_limit')}
                            </FormLabel>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="licenseSeats"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                id="licenseSeats"
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel htmlFor="licenseSeats">
                              {t('dashboard.licenses.concurrent_users')}
                            </FormLabel>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="licenseExpirationType"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                id="licenseExpirationType"
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel htmlFor="licenseExpirationType">
                              {t('dashboard.licenses.expiration_type')}
                            </FormLabel>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="licenseExpirationStart"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                id="licenseExpirationStart"
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel htmlFor="licenseExpirationStart">
                              {t('dashboard.licenses.expiration_start')}
                            </FormLabel>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="licenseExpirationDate"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                id="licenseExpirationDate"
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel htmlFor="licenseExpirationDate">
                              {t('dashboard.licenses.expiration_date')}
                            </FormLabel>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="licenseExpirationDays"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                id="licenseExpirationDays"
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel htmlFor="licenseExpirationDays">
                              {t('dashboard.licenses.expiration_days')}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="mt-2">
                      <Label>{t('general.metadata')}</Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {licenseMetadataKeys.map((key) => (
                          <div
                            key={key}
                            className="flex max-w-full items-center rounded-md bg-secondary px-2 py-1"
                          >
                            <span
                              className="mr-1 max-w-[200px] truncate text-sm"
                              title={key}
                            >
                              {key}
                            </span>
                            <Button
                              className="ml-auto h-5 w-5 flex-shrink-0 p-0"
                              size="sm"
                              type="button"
                              variant="ghost"
                              onClick={() => removeLicenseMetadataKey(key)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            className="flex-1"
                            maxLength={255}
                            placeholder={t(
                              'dashboard.settings.add_metadata_key',
                            )}
                            value={newLicenseKey}
                            onBlur={() =>
                              setTimeout(
                                () => setShowLicenseSuggestions(false),
                                200,
                              )
                            }
                            onChange={(e) => setNewLicenseKey(e.target.value)}
                            onFocus={() => setShowLicenseSuggestions(true)}
                          />
                          {showLicenseSuggestions &&
                            newLicenseKey &&
                            getFilteredSuggestions(newLicenseKey).length >
                              0 && (
                              <div className="absolute left-0 right-0 top-full z-10 mt-1 w-full bg-popover">
                                <Command className="rounded-lg border shadow-md">
                                  <CommandGroup>
                                    {getFilteredSuggestions(newLicenseKey).map(
                                      (key) => (
                                        <CommandItem
                                          key={key}
                                          onSelect={() => {
                                            setNewLicenseKey(key);
                                            setShowLicenseSuggestions(false);
                                          }}
                                        >
                                          {key}
                                        </CommandItem>
                                      ),
                                    )}
                                  </CommandGroup>
                                </Command>
                              </div>
                            )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addLicenseMetadataKey}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          {t('general.add')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Customer Fields */}
              <AccordionItem value="customer">
                <AccordionTrigger className="text-md font-semibold">
                  {t('dashboard.settings.customer_fields')}
                </AccordionTrigger>
                <AccordionContent allowOverflow>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FormField
                        control={control}
                        name="customerEmail"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                id="customerEmail"
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel htmlFor="customerEmail">
                              {t('general.email')}
                            </FormLabel>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="customerFullName"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                id="customerFullName"
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel htmlFor="customerFullName">
                              {t('general.full_name')}
                            </FormLabel>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="customerUsername"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                id="customerUsername"
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel htmlFor="customerUsername">
                              {t('general.username')}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="mt-2">
                      <Label>{t('general.metadata')}</Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {customerMetadataKeys.map((key) => (
                          <div
                            key={key}
                            className="flex max-w-full items-center rounded-md bg-secondary px-2 py-1"
                          >
                            <span
                              className="mr-1 max-w-[200px] truncate text-sm"
                              title={key}
                            >
                              {key}
                            </span>
                            <Button
                              className="ml-auto h-5 w-5 flex-shrink-0 p-0"
                              size="sm"
                              type="button"
                              variant="ghost"
                              onClick={() => removeCustomerMetadataKey(key)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            className="flex-1"
                            maxLength={255}
                            placeholder={t(
                              'dashboard.settings.add_metadata_key',
                            )}
                            value={newCustomerKey}
                            onBlur={() =>
                              setTimeout(
                                () => setShowCustomerSuggestions(false),
                                200,
                              )
                            }
                            onChange={(e) => setNewCustomerKey(e.target.value)}
                            onFocus={() => setShowCustomerSuggestions(true)}
                          />
                          {showCustomerSuggestions &&
                            newCustomerKey &&
                            getFilteredSuggestions(newCustomerKey).length >
                              0 && (
                              <div className="absolute left-0 right-0 top-full z-10 mt-1 w-full bg-popover">
                                <Command className="rounded-lg border shadow-md">
                                  <CommandGroup>
                                    {getFilteredSuggestions(newCustomerKey).map(
                                      (key) => (
                                        <CommandItem
                                          key={key}
                                          onSelect={() => {
                                            setNewCustomerKey(key);
                                            setShowCustomerSuggestions(false);
                                          }}
                                        >
                                          {key}
                                        </CommandItem>
                                      ),
                                    )}
                                  </CommandGroup>
                                </Command>
                              </div>
                            )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addCustomerMetadataKey}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          {t('general.add')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Product Fields */}
              <AccordionItem value="product">
                <AccordionTrigger className="text-md font-semibold">
                  {t('dashboard.settings.product_fields')}
                </AccordionTrigger>
                <AccordionContent allowOverflow>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FormField
                        control={control}
                        name="productName"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                id="productName"
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel htmlFor="productName">
                              {t('general.name')}
                            </FormLabel>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="productUrl"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                id="productUrl"
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel htmlFor="productUrl">
                              {t('general.url')}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="mt-2">
                      <Label>
                        {t('dashboard.settings.product_metadata_keys')}
                      </Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {productMetadataKeys.map((key) => (
                          <div
                            key={key}
                            className="flex max-w-full items-center rounded-md bg-secondary px-2 py-1"
                          >
                            <span
                              className="mr-1 max-w-[200px] truncate text-sm"
                              title={key}
                            >
                              {key}
                            </span>
                            <Button
                              className="ml-auto h-5 w-5 flex-shrink-0 p-0"
                              size="sm"
                              type="button"
                              variant="ghost"
                              onClick={() => removeProductMetadataKey(key)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            className="flex-1"
                            maxLength={255}
                            placeholder={t(
                              'dashboard.settings.add_metadata_key',
                            )}
                            value={newProductKey}
                            onBlur={() =>
                              setTimeout(
                                () => setShowProductSuggestions(false),
                                200,
                              )
                            }
                            onChange={(e) => setNewProductKey(e.target.value)}
                            onFocus={() => setShowProductSuggestions(true)}
                          />
                          {showProductSuggestions &&
                            newProductKey &&
                            getFilteredSuggestions(newProductKey).length >
                              0 && (
                              <div className="absolute left-0 right-0 top-full z-10 mt-1 w-full bg-popover">
                                <Command className="rounded-lg border shadow-md">
                                  <CommandGroup>
                                    {getFilteredSuggestions(newProductKey).map(
                                      (key) => (
                                        <CommandItem
                                          key={key}
                                          onSelect={() => {
                                            setNewProductKey(key);
                                            setShowProductSuggestions(false);
                                          }}
                                        >
                                          {key}
                                        </CommandItem>
                                      ),
                                    )}
                                  </CommandGroup>
                                </Command>
                              </div>
                            )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addProductMetadataKey}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          {t('general.add')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </form>
        </Form>
      </CardContent>
      <CardFooter>
        <LoadingButton
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
