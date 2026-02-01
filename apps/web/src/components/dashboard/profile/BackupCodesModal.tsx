'use client';
import { IRegenerateBackupCodesResponse } from '@/app/api/(dashboard)/users/two-factor/backup-codes/regenerate/route';
import LoadingButton from '@/components/shared/LoadingButton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import {
  RegenerateBackupCodesSchema,
  regenerateBackupCodesSchema,
} from '@/lib/validation/two-factor/regenerate-backup-codes-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  AlertTriangle,
  Copy,
  Download,
  EyeIcon,
  EyeOffIcon,
  RefreshCw,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface BackupCodesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backupCodesRemaining: number;
  onBackupCodesRegenerated: (newCount: number) => void;
}

type Step = 'info' | 'password' | 'verify' | 'display';

export default function BackupCodesModal({
  open,
  onOpenChange,
  backupCodesRemaining,
  onBackupCodesRegenerated,
}: BackupCodesModalProps) {
  const t = useTranslations();
  const [step, setStep] = useState<Step>('info');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  const form = useForm<RegenerateBackupCodesSchema>({
    resolver: zodResolver(regenerateBackupCodesSchema(t)),
    defaultValues: {
      password: '',
      totpCode: '',
    },
  });

  const handleRegenerate = async (payload: RegenerateBackupCodesSchema) => {
    const response = await fetch(
      '/api/users/two-factor/backup-codes/regenerate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    const data = (await response.json()) as IRegenerateBackupCodesResponse;

    return data;
  };

  const onSubmit = async (data: RegenerateBackupCodesSchema) => {
    setLoading(true);
    setFormError(null);
    try {
      const res = await handleRegenerate(data);

      if ('message' in res) {
        if (res.field) {
          return form.setError(res.field as keyof RegenerateBackupCodesSchema, {
            type: 'manual',
            message: res.message,
          });
        }
        return setFormError(res.message);
      }

      setNewBackupCodes(res.backupCodes);
      onBackupCodesRegenerated(res.backupCodes.length);
      setStep('display');
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPassword = async () => {
    const password = form.getValues('password');
    if (!password) return;

    setVerifyingPassword(true);
    setFormError(null);
    form.clearErrors('password');

    try {
      const response = await fetch('/api/users/two-factor/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if ('message' in data) {
        if (data.field === 'password') {
          form.setError('password', { type: 'manual', message: data.message });
        } else {
          setFormError(data.message);
        }
        return;
      }

      setStep('verify');
    } catch {
      setFormError(t('general.error_occurred'));
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset();
      setStep('info');
      setFormError(null);
      setShowPassword(false);
      setNewBackupCodes([]);
      setVerifyingPassword(false);
    }
    onOpenChange(open);
  };

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(newBackupCodes.join('\n'));
    toast.success(t('dashboard.profile.backup_codes_copied'));
  };

  const handleDownloadBackupCodes = () => {
    const content = newBackupCodes.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lukittu-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t('dashboard.profile.backup_codes_downloaded'));
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[500px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.profile.backup_codes')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {step === 'info' && t('dashboard.profile.backup_codes_info_desc')}
            {step === 'password' &&
              t('dashboard.profile.backup_codes_password_desc')}
            {step === 'verify' &&
              t('dashboard.profile.backup_codes_verify_desc')}
            {step === 'display' &&
              t('dashboard.profile.backup_codes_display_desc')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {step === 'info' && (
          <div className="space-y-4 max-md:px-2">
            <div className="rounded-lg border bg-muted p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {t('dashboard.profile.codes_remaining')}
                </span>
                <span
                  className={`text-2xl font-bold ${
                    backupCodesRemaining <= 2 ? 'text-destructive' : ''
                  }`}
                >
                  {backupCodesRemaining}/10
                </span>
              </div>
            </div>

            {backupCodesRemaining <= 2 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{t('general.warning')}</AlertTitle>
                <AlertDescription>
                  {t('dashboard.profile.low_backup_codes_warning')}
                </AlertDescription>
              </Alert>
            )}

            <p className="text-sm text-muted-foreground">
              {t('dashboard.profile.regenerate_codes_info')}
            </p>
          </div>
        )}

        {step === 'password' && (
          <Form {...form}>
            <div className="space-y-4 max-md:px-2">
              {formError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t('general.error')}</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <form className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('general.password')}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            autoComplete="current-password"
                            placeholder="********"
                            type={showPassword ? 'text' : 'password'}
                            {...field}
                          />
                          <Button
                            className="absolute bottom-1 right-1 h-7 w-7"
                            size="icon"
                            type="button"
                            variant="ghost"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </div>
          </Form>
        )}

        {step === 'verify' && (
          <Form {...form}>
            <div className="space-y-4 max-md:px-2">
              {formError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t('general.error')}</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <FormField
                  control={form.control}
                  name="totpCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('dashboard.profile.verification_code')}
                      </FormLabel>
                      <FormControl>
                        <Input
                          autoComplete="one-time-code"
                          className="text-center font-mono text-lg tracking-widest"
                          inputMode="numeric"
                          maxLength={6}
                          pattern="[0-9]*"
                          placeholder="000000"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <button className="hidden" type="submit" />
              </form>
            </div>
          </Form>
        )}

        {step === 'display' && (
          <div className="space-y-4 max-md:px-2">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t('general.important')}</AlertTitle>
              <AlertDescription>
                {t('dashboard.profile.save_backup_codes_warning')}
              </AlertDescription>
            </Alert>
            <div className="rounded-lg border bg-muted p-4">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {newBackupCodes.map((code, index) => (
                  <div
                    key={index}
                    className="rounded bg-background p-2 text-center"
                  >
                    {code}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                type="button"
                variant="secondary"
                onClick={handleCopyBackupCodes}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t('general.copy')}
              </Button>
              <Button
                className="flex-1"
                type="button"
                variant="secondary"
                onClick={handleDownloadBackupCodes}
              >
                <Download className="mr-2 h-4 w-4" />
                {t('general.download')}
              </Button>
            </div>
          </div>
        )}

        <ResponsiveDialogFooter>
          {step === 'info' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {t('general.close')}
              </Button>
              <Button size="sm" onClick={() => setStep('password')}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('dashboard.profile.regenerate_codes')}
              </Button>
            </>
          )}
          {step === 'password' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStep('info')}
              >
                {t('general.back')}
              </Button>
              <LoadingButton
                disabled={!form.getValues('password')}
                pending={verifyingPassword}
                size="sm"
                onClick={handleVerifyPassword}
              >
                {t('general.next')}
              </LoadingButton>
            </>
          )}
          {step === 'verify' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStep('password')}
              >
                {t('general.back')}
              </Button>
              <LoadingButton
                pending={loading}
                size="sm"
                onClick={() => form.handleSubmit(onSubmit)()}
              >
                {t('dashboard.profile.regenerate_codes')}
              </LoadingButton>
            </>
          )}
          {step === 'display' && (
            <Button
              className="w-full"
              size="sm"
              onClick={() => handleOpenChange(false)}
            >
              {t('dashboard.profile.done_saved_codes')}
            </Button>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
