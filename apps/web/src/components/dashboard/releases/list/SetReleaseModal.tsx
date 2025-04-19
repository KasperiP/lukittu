'use client';
import { IProductsReleasesCreateResponse } from '@/app/api/(dashboard)/products/releases/route';
import { LicensesMultiselect } from '@/components/shared/form/LicensesMultiselect';
import MetadataFields from '@/components/shared/form/MetadataFields';
import { ProductSelector } from '@/components/shared/form/ProductSelector';
import LoadingButton from '@/components/shared/LoadingButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { bytesToSize } from '@/lib/utils/number-helpers';
import {
  setReleaseSchema,
  SetReleaseSchema,
} from '@/lib/validation/products/set-release-schema';
import { ReleaseModalContext } from '@/providers/ReleasesModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { zodResolver } from '@hookform/resolvers/zod';
import { FileIcon, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

const MAX_FILE_SIZE = 1024 * 1024 * 10; // 10 MB

export default function SetReleaseModal() {
  const t = useTranslations();
  const ctx = useContext(ReleaseModalContext);
  const teamCtx = useContext(TeamContext);

  const selectedTeam = teamCtx.teams.find(
    (team) => team.id === teamCtx.selectedTeam,
  );

  const hasFileUploadPermission =
    selectedTeam?.limits?.allowClassloader ?? false;

  const form = useForm<SetReleaseSchema>({
    resolver: zodResolver(setReleaseSchema(t)),
    defaultValues: {
      status: 'DRAFT',
      version: '',
      metadata: [],
      productId: ctx.productId || '',
      setAsLatest: false,
      keepExistingFile: false,
      licenseIds: [],
    },
  });

  const {
    setValue,
    handleSubmit,
    watch,
    formState,
    setError,
    reset,
    control,
    getValues,
  } = form;

  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { mutate } = useSWRConfig();

  useEffect(() => {
    if (ctx.releaseToEdit) {
      setValue('keepExistingFile', ctx.releaseToEdit.file !== null);
      setValue('version', ctx.releaseToEdit.version);
      setValue('status', ctx.releaseToEdit.status);
      setValue('productId', ctx.releaseToEdit.productId);
      setValue('setAsLatest', ctx.releaseToEdit.latest || false);
      setValue(
        'licenseIds',
        ctx.releaseToEdit.allowedLicenses.map((l) => l.id),
      );
      setValue(
        'metadata',
        (
          ctx.releaseToEdit.metadata as {
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
  }, [ctx.releaseToEdit, setValue]);

  const keepExistingFile = watch('keepExistingFile');
  const releaseStatus = watch('status');
  const selectedLicenses = watch('licenseIds');
  const hasLicenseRestrictions = selectedLicenses.length > 0;

  const handleReleaseCreate = async (payload: SetReleaseSchema) => {
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }

    const jsonPayload = JSON.stringify(payload);
    formData.append('data', jsonPayload);

    const response = await fetch('/api/products/releases', {
      method: 'POST',
      body: formData,
    });

    const data = (await response.json()) as IProductsReleasesCreateResponse;

    return data;
  };

  const handleReleaseUpdate = async (payload: SetReleaseSchema) => {
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }

    const jsonPayload = JSON.stringify(payload);
    formData.append('data', jsonPayload);

    const response = await fetch(
      `/api/products/releases/${ctx.releaseToEdit?.id}`,
      {
        method: 'PUT',
        body: formData,
      },
    );

    const data = (await response.json()) as IProductsReleasesCreateResponse;

    return data;
  };

  const handleFileSelect = () => {
    if (!hasFileUploadPermission) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = false;
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (file.size > MAX_FILE_SIZE) {
          return toast.error(
            t('validation.file_too_large', {
              size: bytesToSize(MAX_FILE_SIZE),
            }),
          );
        }
        setFile(file);
      }
    };
    input.click();
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileUploadPermission) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0] as File | null;
    if (droppedFile) {
      if (droppedFile.size > MAX_FILE_SIZE) {
        return toast.error(
          t('validation.file_too_large', {
            size: bytesToSize(MAX_FILE_SIZE),
          }),
        );
      }
      setFile(droppedFile);
    }
  };

  const onSubmit = async (data: SetReleaseSchema) => {
    setLoading(true);
    try {
      const res = ctx.releaseToEdit
        ? await handleReleaseUpdate(data)
        : await handleReleaseCreate(data);

      if ('message' in res) {
        if (res.field) {
          return setError(res.field as keyof SetReleaseSchema, {
            type: 'manual',
            message: res.message,
          });
        }

        handleOpenChange(false);
        return toast.error(res.message);
      }

      mutate(
        (key) => Array.isArray(key) && key[0] === '/api/products/releases',
      );
      handleOpenChange(false);
      toast.success(
        ctx.releaseToEdit
          ? t('dashboard.releases.release_updated')
          : t('dashboard.releases.release_created'),
      );
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    ctx.setReleaseModalOpen(open);
    reset();
    setFile(null);
    if (!open) {
      ctx.setReleaseToEdit(null);
    }
  };

  return (
    <>
      <ResponsiveDialog
        open={ctx.releaseModalOpen}
        onOpenChange={handleOpenChange}
      >
        <ResponsiveDialogContent className="sm:max-w-[625px]">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t('dashboard.releases.create_release')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t('dashboard.releases.release_description')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <Form {...form}>
            <form
              className="space-y-4 max-md:px-2"
              onSubmit={handleSubmit(onSubmit)}
            >
              {!ctx.productId && (
                <FormItem>
                  <Label
                    className={
                      formState.errors.productId ? 'text-destructive' : ''
                    }
                  >
                    {t('general.product')} *
                  </Label>
                  <ProductSelector
                    initialValue={ctx.releaseToEdit?.productId}
                    onChange={(productId) =>
                      setValue('productId', productId ?? '', {
                        shouldValidate: true,
                      })
                    }
                  />
                  {formState.errors.productId && (
                    <FormMessage>
                      {formState.errors.productId.message}
                    </FormMessage>
                  )}
                </FormItem>
              )}
              <FormField
                control={control}
                name="version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('general.version')} *</FormLabel>
                    <FormControl>
                      <Input placeholder="v1.0.0" required {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('general.status')} *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t('general.select_status')}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="DRAFT">
                          {t('general.draft')}
                        </SelectItem>
                        <SelectItem value="PUBLISHED">
                          {t('general.published')}
                        </SelectItem>
                        <SelectItem value="DEPRECATED">
                          {t('general.deprecated')}
                        </SelectItem>
                        <SelectItem value="ARCHIVED">
                          {t('general.archived')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {releaseStatus === 'PUBLISHED' && (
                <FormField
                  control={control}
                  name="setAsLatest"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          disabled={hasLicenseRestrictions}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          {t('dashboard.releases.set_as_latest')}
                          {hasLicenseRestrictions && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (
                              {t(
                                'dashboard.releases.disabled_due_to_license_restrictions',
                              )}
                              )
                            </span>
                          )}
                        </FormLabel>
                        <FormDescription>
                          {t('dashboard.releases.set_as_latest_description')}
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              )}
              <FormItem>
                <div className="flex items-center gap-2">
                  <Label>{t('general.file')}</Label>
                  {!hasFileUploadPermission && (
                    <Badge variant="primary">PRO</Badge>
                  )}
                </div>
                {!file && !keepExistingFile ? (
                  <div
                    className={`flex cursor-${
                      hasFileUploadPermission ? 'pointer' : 'not-allowed'
                    } flex-col items-center gap-1 rounded-lg border-2 transition-all duration-200 ease-in-out ${
                      isDragging && hasFileUploadPermission
                        ? 'scale-[1.01] border-solid border-primary bg-primary/5'
                        : 'border-dashed'
                    } ${!hasFileUploadPermission ? 'opacity-50' : ''} relative p-6`}
                    onClick={handleFileSelect}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  >
                    <div className="pointer-events-none flex flex-col items-center gap-1">
                      <FileIcon
                        className={`h-12 w-12 transition-transform duration-200 ${
                          isDragging && hasFileUploadPermission
                            ? 'scale-110'
                            : ''
                        }`}
                      />
                      <span className="text-sm font-medium text-muted-foreground transition-opacity duration-200">
                        {!hasFileUploadPermission
                          ? t('validation.paid_subsciption_required')
                          : isDragging
                            ? t('dashboard.releases.drop_file_here')
                            : t('dashboard.releases.click_here_to_upload')}
                      </span>
                      {hasFileUploadPermission && (
                        <span className="text-xs text-muted-foreground">
                          {t('dashboard.releases.supported_file_types', {
                            size: bytesToSize(MAX_FILE_SIZE),
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4 rounded-lg border p-2 pl-1">
                    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                      <div className="shrink-0 rounded-md p-2">
                        <FileIcon className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <p className="truncate text-sm font-medium">
                          {file?.name ?? ctx.releaseToEdit?.file?.name}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-4 text-xs text-muted-foreground">
                          <span className="shrink-0">
                            {bytesToSize(
                              file?.size ?? ctx.releaseToEdit?.file?.size ?? 0,
                            )}
                          </span>
                          {ctx.releaseToEdit?.file && !file && (
                            <span className="truncate">
                              {t('general.uploaded')}:{' '}
                              {new Date(
                                ctx.releaseToEdit.file.createdAt,
                              ).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      className="h-8 w-8 shrink-0"
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setFile(null);
                        setValue('keepExistingFile', false);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </FormItem>
              <FormField
                control={control}
                name="licenseIds"
                render={() => (
                  <FormItem>
                    <FormLabel>{t('general.restrict_to_licenses')}</FormLabel>
                    <FormControl>
                      <LicensesMultiselect
                        disabled={getValues('setAsLatest')}
                        selectedLicenses={ctx.releaseToEdit?.allowedLicenses}
                        value={watch('licenseIds')}
                        onChange={(licenseIds) => {
                          setValue('licenseIds', licenseIds);
                          if (licenseIds.length > 0) {
                            setValue('setAsLatest', false);
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {selectedLicenses.length === 0
                        ? t('dashboard.releases.no_license_restrictions')
                        : t('dashboard.releases.license_restrictions_applied')}
                    </FormDescription>
                    <FormMessage />
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
                pending={loading}
                type="submit"
                onClick={() => handleSubmit(onSubmit)()}
              >
                {ctx.releaseToEdit
                  ? t('dashboard.releases.update_release')
                  : t('dashboard.releases.create_release')}
              </LoadingButton>
            </div>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
