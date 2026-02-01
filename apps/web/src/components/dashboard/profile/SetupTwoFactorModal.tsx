'use client';
import { ITwoFactorEnableResponse } from '@/app/api/(dashboard)/users/two-factor/enable/route';
import { ITwoFactorSetupResponse } from '@/app/api/(dashboard)/users/two-factor/setup/route';
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
  EnableTwoFactorSchema,
  enableTwoFactorSchema,
} from '@/lib/validation/two-factor/enable-two-factor-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  CheckCircle,
  Copy,
  Download,
  EyeIcon,
  EyeOffIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import QRCode from 'qrcode';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface SetupTwoFactorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetupComplete: () => void;
}

type Step = 'password' | 'scan' | 'verify' | 'backup';

export default function SetupTwoFactorModal({
  open,
  onOpenChange,
  onSetupComplete,
}: SetupTwoFactorModalProps) {
  const t = useTranslations();
  const [step, setStep] = useState<Step>('password');
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [secret, setSecret] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<EnableTwoFactorSchema>({
    resolver: zodResolver(enableTwoFactorSchema(t)),
    defaultValues: {
      totpCode: '',
      password: '',
    },
  });

  const handlePasswordSubmit = async () => {
    const password = form.getValues('password');
    if (!password) return;

    setSetupLoading(true);
    setFormError(null);
    form.clearErrors('password');

    try {
      const response = await fetch('/api/users/two-factor/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json()) as ITwoFactorSetupResponse;

      if ('secret' in data) {
        setSecret(data.secret);
        const dataUrl = await QRCode.toDataURL(data.qrCodeUri, {
          width: 200,
          margin: 2,
        });
        setQrCodeDataUrl(dataUrl);
        setStep('scan');
      } else {
        if ('field' in data && data.field === 'password') {
          form.setError('password', {
            type: 'manual',
            message: data.message,
          });
        } else {
          setFormError(data.message);
        }
      }
    } catch {
      setFormError(t('general.error_occurred'));
    } finally {
      setSetupLoading(false);
    }
  };

  const handleEnable = async (payload: EnableTwoFactorSchema) => {
    const response = await fetch('/api/users/two-factor/enable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ITwoFactorEnableResponse;

    return data;
  };

  const onSubmit = async (data: EnableTwoFactorSchema) => {
    setLoading(true);
    setFormError(null);
    try {
      const res = await handleEnable(data);

      if ('message' in res) {
        if (res.field) {
          return form.setError(res.field as keyof EnableTwoFactorSchema, {
            type: 'manual',
            message: res.message,
          });
        }
        return setFormError(res.message);
      }

      setBackupCodes(res.backupCodes);
      setStep('backup');
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset();
      setStep('password');
      setSecret('');
      setQrCodeDataUrl('');
      setBackupCodes([]);
      setFormError(null);
      setShowPassword(false);
      setShowSecret(false);
    }
    onOpenChange(open);
  };

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    toast.success(t('dashboard.profile.backup_codes_copied'));
  };

  const handleDownloadBackupCodes = () => {
    const content = backupCodes.join('\n');
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

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret);
    toast.success(t('dashboard.profile.secret_copied'));
  };

  const handleFinish = () => {
    onSetupComplete();
    handleOpenChange(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[500px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.profile.setup_two_factor')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {step === 'password' &&
              t('dashboard.profile.setup_two_factor_password_desc')}
            {step === 'scan' &&
              t('dashboard.profile.setup_two_factor_scan_desc')}
            {step === 'verify' &&
              t('dashboard.profile.setup_two_factor_verify_desc')}
            {step === 'backup' &&
              t('dashboard.profile.setup_two_factor_backup_desc')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

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
                            {showPassword ? (
                              <EyeOffIcon className="h-4 w-4" />
                            ) : (
                              <EyeIcon className="h-4 w-4" />
                            )}
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

        {step === 'scan' && (
          <div className="flex flex-col items-center gap-4 max-md:px-2">
            {setupLoading ? (
              <div className="flex h-[200px] w-[200px] items-center justify-center rounded-lg border bg-muted">
                <div className="text-sm text-muted-foreground">
                  {t('general.loading')}...
                </div>
              </div>
            ) : (
              qrCodeDataUrl && (
                <Image
                  alt="QR Code"
                  className="rounded-lg border"
                  height={200}
                  src={qrCodeDataUrl}
                  width={200}
                />
              )
            )}
            <div className="w-full space-y-2">
              <p className="text-sm text-muted-foreground">
                {t('dashboard.profile.cant_scan_qr')}
              </p>
              <div className="flex items-center gap-2">
                <Input
                  className="font-mono text-sm"
                  value={showSecret ? secret : '••••••••••••••••'}
                  readOnly
                />
                <Button
                  className="shrink-0"
                  size="icon"
                  type="button"
                  variant="outline"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  className="shrink-0"
                  size="icon"
                  type="button"
                  variant="outline"
                  onClick={handleCopySecret}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
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

        {step === 'backup' && (
          <div className="space-y-4 max-md:px-2">
            <Alert>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertTitle>
                {t('dashboard.profile.two_factor_enabled_success')}
              </AlertTitle>
              <AlertDescription>
                {t('dashboard.profile.save_backup_codes_warning')}
              </AlertDescription>
            </Alert>
            <div className="rounded-lg border bg-muted p-4">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {backupCodes.map((code, index) => (
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
          {step === 'password' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {t('general.cancel')}
              </Button>
              <LoadingButton
                disabled={!form.getValues('password')}
                pending={setupLoading}
                size="sm"
                onClick={handlePasswordSubmit}
              >
                {t('general.next')}
              </LoadingButton>
            </>
          )}
          {step === 'scan' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStep('password')}
              >
                {t('general.back')}
              </Button>
              <Button
                disabled={!secret}
                size="sm"
                onClick={() => setStep('verify')}
              >
                {t('general.next')}
              </Button>
            </>
          )}
          {step === 'verify' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStep('scan')}
              >
                {t('general.back')}
              </Button>
              <LoadingButton
                pending={loading}
                size="sm"
                onClick={() => form.handleSubmit(onSubmit)()}
              >
                {t('dashboard.profile.verify_and_enable')}
              </LoadingButton>
            </>
          )}
          {step === 'backup' && (
            <Button className="w-full" size="sm" onClick={handleFinish}>
              {t('dashboard.profile.done_saved_codes')}
            </Button>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
