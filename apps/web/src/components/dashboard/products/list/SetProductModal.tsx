'use client';
import { IProductsCreateResponse } from '@/app/api/(dashboard)/products/route';
import DiscordRoleMappingFields from '@/components/shared/form/DiscordRoleMappingFields';
import MetadataFields from '@/components/shared/form/MetadataFields';
import LoadingButton from '@/components/shared/LoadingButton';
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
import {
  SetProductSchema,
  setProductSchema,
} from '@/lib/validation/products/set-product-schema';
import { ProductModalContext } from '@/providers/ProductModalProvider';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, Hash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export default function SetProductModal() {
  const t = useTranslations();
  const ctx = useContext(ProductModalContext);
  const [loading, setLoading] = useState(false);
  const [discordMappingOpen, setDiscordMappingOpen] = useState(false);
  const { mutate } = useSWRConfig();

  const form = useForm<SetProductSchema>({
    resolver: zodResolver(setProductSchema(t)),
    defaultValues: {
      name: '',
      url: '',
      metadata: [],
      discordRoleMapping: [],
    },
  });

  const { setValue, handleSubmit, reset, setError, control } = form;

  useEffect(() => {
    if (ctx.productToEdit) {
      setValue('name', ctx.productToEdit.name);
      setValue('url', ctx.productToEdit.url ?? '');
      setValue(
        'metadata',
        (
          ctx.productToEdit.metadata as {
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

      const discordMappings = ctx.productToEdit.discordRoles.map((role) => ({
        discordGuildId: role.guildId,
        discordRoleId: role.roleId,
      }));

      setValue('discordRoleMapping', discordMappings);

      // Expand Discord section if there are existing mappings
      setDiscordMappingOpen(discordMappings.length > 0);
    }
  }, [ctx.productToEdit, setValue]);

  const handleProductCreate = async (payload: SetProductSchema) => {
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as IProductsCreateResponse;

    return data;
  };

  const handleProductEdit = async (payload: SetProductSchema) => {
    const response = await fetch(`/api/products/${ctx.productToEdit?.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as IProductsCreateResponse;

    return data;
  };

  const onSubmit = async (data: SetProductSchema) => {
    setLoading(true);
    try {
      const res = ctx.productToEdit
        ? await handleProductEdit(data)
        : await handleProductCreate(data);

      if ('message' in res) {
        if (res.field) {
          return setError(res.field as keyof SetProductSchema, {
            type: 'manual',
            message: res.message,
          });
        }

        handleOpenChange(false);
        return toast.error(res.message);
      }

      mutate((key) => Array.isArray(key) && key[0] === '/api/products');
      handleOpenChange(false);
      toast.success(
        ctx.productToEdit
          ? t('dashboard.products.product_updated')
          : t('dashboard.products.product_created'),
      );
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setProductModalOpen(open);
    reset();
    if (!open) {
      ctx.setProductToEdit(null);
      setDiscordMappingOpen(false);
    }
  };

  return (
    <>
      <ResponsiveDialog
        open={ctx.productModalOpen}
        onOpenChange={handleOpenChange}
      >
        <ResponsiveDialogContent className="sm:max-w-[625px]">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t('dashboard.products.add_product')}
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('general.name')} *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t(
                          'dashboard.products.my_first_product_placeholder',
                        )}
                        required
                        {...field}
                      />
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
                      <Input placeholder="https://lukittu.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <MetadataFields form={form} />

              <Separator />

              <Collapsible
                open={discordMappingOpen}
                onOpenChange={setDiscordMappingOpen}
              >
                <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between rounded-lg border border-input bg-background px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/50 transition-colors group-hover:bg-muted">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold">
                          {t('dashboard.products.discord_integration')}
                        </span>
                        {(() => {
                          const mappings = form.watch('discordRoleMapping');
                          return (
                            Boolean(mappings?.length) && (
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-green-500" />
                                <span className="text-sm font-medium text-muted-foreground">
                                  {mappings?.length} {t('general.mapped')}
                                </span>
                              </div>
                            )
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                      discordMappingOpen ? 'rotate-180' : ''
                    }`}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  <DiscordRoleMappingFields
                    existingDiscordRoles={ctx.productToEdit?.discordRoles ?? []}
                    form={form}
                  />
                </CollapsibleContent>
              </Collapsible>

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
                {ctx.productToEdit
                  ? t('dashboard.products.edit_product')
                  : t('dashboard.products.add_product')}
              </LoadingButton>
            </div>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
