'use client';
import { ITwoFactorDisableResponse } from '@/app/api/(dashboard)/users/two-factor/disable/route';
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
  DisableTwoFactorSchema,
  disableTwoFactorSchema,
} from '@/lib/validation/two-factor/disable-two-factor-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  EyeIcon,
  EyeOffIcon,
  KeyRound,
  Shield,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface DisableTwoFactorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisableComplete: () => void;
}

type Step = 'password' | 'verify';

export default function DisableTwoFactorModal({
  open,
  onOpenChange,
  onDisableComplete,
}: DisableTwoFactorModalProps) {
  const t = useTranslations();
  const [step, setStep] = useState<Step>('password');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  const form = useForm<DisableTwoFactorSchema>({
    resolver: zodResolver(disableTwoFactorSchema(t)),
    defaultValues: {
      password: '',
      totpCode: '',
    },
  });

  const handleDisable = async (payload: DisableTwoFactorSchema) => {
    const response = await fetch('/api/users/two-factor/disable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ITwoFactorDisableResponse;

    return data;
  };

  const onSubmit = async (data: DisableTwoFactorSchema) => {
    setLoading(true);
    setFormError(null);
    try {
      const res = await handleDisable(data);

      if ('message' in res) {
        if (res.field) {
          return form.setError(res.field as keyof DisableTwoFactorSchema, {
            type: 'manual',
            message: res.message,
          });
        }
        return setFormError(res.message);
      }

      toast.success(t('dashboard.profile.two_factor_disabled_success'));
      onDisableComplete();
      handleOpenChange(false);
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
      setStep('password');
      setFormError(null);
      setShowPassword(false);
      setUseBackupCode(false);
      setVerifyingPassword(false);
    }
    onOpenChange(open);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[500px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.profile.disable_two_factor')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {step === 'password' &&
              t('dashboard.profile.disable_two_factor_password_desc')}
            {step === 'verify' &&
              t('dashboard.profile.disable_two_factor_verify_desc')}
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
                        {useBackupCode
                          ? t('auth.two_factor.backup_code')
                          : t('dashboard.profile.verification_code')}
                      </FormLabel>
                      <FormControl>
                        {useBackupCode ? (
                          <Input
                            autoComplete="one-time-code"
                            className="text-center font-mono text-lg tracking-widest"
                            maxLength={8}
                            placeholder="XXXXXXXX"
                            {...field}
                          />
                        ) : (
                          <Input
                            autoComplete="one-time-code"
                            className="text-center font-mono text-lg tracking-widest"
                            inputMode="numeric"
                            maxLength={6}
                            pattern="[0-9]*"
                            placeholder="000000"
                            {...field}
                          />
                        )}
                      </FormControl>
                      <FormMessage />
                      <Button
                        className="h-auto p-0 text-sm"
                        type="button"
                        variant="link"
                        onClick={() => {
                          setUseBackupCode(!useBackupCode);
                          form.setValue('totpCode', '');
                        }}
                      >
                        {useBackupCode ? (
                          <>
                            <Shield className="mr-1 h-3 w-3" />
                            {t('auth.two_factor.use_authenticator')}
                          </>
                        ) : (
                          <>
                            <KeyRound className="mr-1 h-3 w-3" />
                            {t('auth.two_factor.use_backup_code')}
                          </>
                        )}
                      </Button>
                    </FormItem>
                  )}
                />
                <button className="hidden" type="submit" />
              </form>
            </div>
          </Form>
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
                variant="destructive"
                onClick={() => form.handleSubmit(onSubmit)()}
              >
                {t('dashboard.profile.disable_two_factor')}
              </LoadingButton>
            </>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
