'use client';
import { ITwoFactorVerifyResponse } from '@/app/api/(dashboard)/auth/two-factor/verify/route';
import LoadingButton from '@/components/shared/LoadingButton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  VerifyTwoFactorSchema,
  verifyTwoFactorSchema,
} from '@/lib/validation/two-factor/verify-two-factor-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import { ThemeSwitcher } from '../shared/ThemeSwitcher';

interface TwoFactorVerificationCardProps {
  twoFactorToken: string;
  rememberMe: boolean;
  onBack: () => void;
}

export default function TwoFactorVerificationCard({
  twoFactorToken,
  rememberMe,
  onBack,
}: TwoFactorVerificationCardProps) {
  const t = useTranslations();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);

  const form = useForm<VerifyTwoFactorSchema>({
    resolver: zodResolver(verifyTwoFactorSchema(t)),
    defaultValues: {
      twoFactorToken,
      totpCode: '',
      rememberMe,
    },
  });

  const formWatcher = useWatch({
    control: form.control,
    defaultValue: form.getValues(),
  });

  useEffect(() => {
    setFormError(null);
  }, [formWatcher]);

  const handleVerify = async (payload: VerifyTwoFactorSchema) => {
    const response = await fetch('/api/auth/two-factor/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ITwoFactorVerifyResponse;

    return data;
  };

  const onSubmit = async (data: VerifyTwoFactorSchema) => {
    setLoading(true);
    try {
      const res = await handleVerify(data);

      if ('message' in res) {
        if (res.field) {
          return form.setError(res.field as keyof VerifyTwoFactorSchema, {
            type: 'manual',
            message: res.message,
          });
        }
        return setFormError(res.message);
      }

      router.push('/dashboard');
    } catch (error: any) {
      setFormError(error.message ?? t('general.server_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-lg p-6 max-md:max-w-md max-md:px-0">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">
          {t('auth.two_factor.title')}
        </CardTitle>
        <CardDescription>
          {useBackupCode
            ? t('auth.two_factor.backup_code_description')
            : t('auth.two_factor.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {formError && (
          <Alert className="mb-6" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('general.error')}</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="totpCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {useBackupCode
                      ? t('auth.two_factor.backup_code')
                      : t('auth.two_factor.verification_code')}
                  </FormLabel>
                  <FormControl>
                    {useBackupCode ? (
                      <Input
                        autoComplete="one-time-code"
                        className="text-center font-mono text-lg tracking-widest"
                        maxLength={8}
                        placeholder="XXXXXXXX"
                        autoFocus
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
                        autoFocus
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          const value = e.target.value;
                          if (value.length === 6 && /^\d{6}$/.test(value)) {
                            form.handleSubmit(onSubmit)();
                          }
                        }}
                      />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rememberMe"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel>{t('auth.login.stay_signed_in')}</FormLabel>
                </FormItem>
              )}
            />
            <LoadingButton className="w-full" pending={loading} type="submit">
              {t('auth.two_factor.verify')}
            </LoadingButton>
          </form>
        </Form>
        <Button
          className="mt-4 w-full"
          size="sm"
          variant="outline"
          onClick={() => {
            setUseBackupCode(!useBackupCode);
            form.setValue('totpCode', '');
            setFormError(null);
          }}
        >
          {useBackupCode
            ? t('auth.two_factor.use_authenticator')
            : t('auth.two_factor.use_backup_code')}
        </Button>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('general.back')}
        </Button>
        <div className="flex gap-1">
          <ThemeSwitcher size="xs" />
          <LanguageSwitcher size="xs" />
        </div>
      </CardFooter>
    </Card>
  );
}
