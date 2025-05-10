'use client';
import { IProductsBranchesUpdateResponse } from '@/app/api/(dashboard)/products/branches/[slug]/route';
import { IProductsBranchesCreateResponse } from '@/app/api/(dashboard)/products/branches/route';
import LoadingButton from '@/components/shared/LoadingButton';
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
  setBranchSchema,
  SetBranchSchema,
} from '@/lib/validation/products/set-branch-schema';
import { BranchModalContext } from '@/providers/BranchModalProvider';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

export default function SetBranchModal() {
  const t = useTranslations();
  const ctx = useContext(BranchModalContext);
  const [loading, setLoading] = useState(false);
  const { mutate } = useSWRConfig();

  const form = useForm<SetBranchSchema>({
    resolver: zodResolver(setBranchSchema(t)),
    defaultValues: {
      name: '',
      productId: ctx.productId || '',
    },
  });

  const { handleSubmit, formState, setError, reset, setValue } = form;

  // Pre-fill form when editing a branch
  useEffect(() => {
    if (ctx.branchToEdit) {
      setValue('name', ctx.branchToEdit.name);
      setValue('productId', ctx.productId || '');
    }
  }, [ctx.branchToEdit, ctx.productId, setValue]);

  const handleBranchCreate = async (payload: SetBranchSchema) => {
    const response = await fetch('/api/products/branches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as IProductsBranchesCreateResponse;
    return data;
  };

  const handleBranchUpdate = async (payload: SetBranchSchema) => {
    const response = await fetch(
      `/api/products/branches/${ctx.branchToEdit?.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    const data = (await response.json()) as IProductsBranchesUpdateResponse;
    return data;
  };

  const onSubmit = async (data: SetBranchSchema) => {
    setLoading(true);
    try {
      const res = ctx.branchToEdit
        ? await handleBranchUpdate(data)
        : await handleBranchCreate(data);

      if ('message' in res) {
        if (res.field) {
          return setError(res.field as keyof SetBranchSchema, {
            type: 'manual',
            message: res.message as string,
          });
        }

        handleOpenChange(false);
        return toast.error(res.message);
      }

      mutate(
        (key) =>
          Array.isArray(key) &&
          ['/api/products/releases', '/api/products/branches'].includes(key[0]),
      );

      handleOpenChange(false);
      toast.success(
        ctx.branchToEdit
          ? t('dashboard.releases.branch_updated')
          : t('dashboard.releases.branch_created'),
      );
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setBranchModalOpen(open);
    reset();
    if (!open) {
      ctx.setBranchToEdit(null);
    }
  };

  return (
    <>
      <ResponsiveDialog
        open={ctx.branchModalOpen}
        onOpenChange={handleOpenChange}
      >
        <ResponsiveDialogContent className="sm:max-w-[500px]">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {ctx.branchToEdit
                ? t('dashboard.releases.update_branch')
                : t('dashboard.releases.create_branch')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t('dashboard.releases.branch_description')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <Form {...form}>
            <form
              className="space-y-4 max-md:px-2"
              onSubmit={handleSubmit(onSubmit)}
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('general.name')} *</FormLabel>
                    <FormControl>
                      <Input placeholder="main" required {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <input
                name="productId"
                type="hidden"
                value={ctx.productId || ''}
              />
              {formState.errors.productId && (
                <div className="text-sm text-destructive">
                  {formState.errors.productId.message}
                </div>
              )}
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
                pending={loading}
                type="submit"
                onClick={() => handleSubmit(onSubmit)()}
              >
                {ctx.branchToEdit
                  ? t('dashboard.releases.update_branch')
                  : t('dashboard.releases.create_branch')}
              </LoadingButton>
            </div>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
