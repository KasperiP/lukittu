'use client';
import { IAuthRegisterResponse } from '@/app/api/(dashboard)/auth/register/route';
import LoginWithGoogleButton from '@/components/auth/LoginWithGoogleButton';
import RegisterSuccessModal from '@/components/auth/RegisterSuccessModal';
import ResendVerifyEmailModal from '@/components/auth/ResendVerifyEmailModal';
import LoadingButton from '@/components/shared/LoadingButton';
import PasswordIndicator from '@/components/shared/PasswordIndicator';
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
import { Separator } from '@/components/ui/separator';
import {
  RegisterSchema,
  registerSchema,
} from '@/lib/validation/auth/register-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { Turnstile, TurnstileInstance } from '@marsidev/react-turnstile';
import { AlertCircle, EyeIcon, EyeOffIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import { ThemeSwitcher } from '../shared/ThemeSwitcher';
import LoginWithGithubButton from './LoginWithGithubButton';

export default function RegisterCard() {
  const t = useTranslations();
  const turnstile = useRef<TurnstileInstance>(null);
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resendVerifyEmailModalOpen, setResendVerifyEmailModalOpen] =
    useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [turnstileLoading, setTurnstileLoading] = useState(false);
  const [showTurnstile, setShowTurnstile] = useState(false);

  const form = useForm<RegisterSchema>({
    resolver: zodResolver(registerSchema(t)),
    defaultValues: {
      email: '',
      fullName: '',
      password: '',
      terms: false,
      token: '',
    },
  });

  const formWatcher = useWatch({
    control: form.control,
    defaultValue: form.getValues(),
  });

  useEffect(() => {
    setFormError(null);
  }, [formWatcher]);

  const handleCredentialsRegister = async (payload: RegisterSchema) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.redirected) {
      return router.push(response.url);
    }

    const data = (await response.json()) as IAuthRegisterResponse;

    return data;
  };

  const onSubmit = async (data: RegisterSchema) => {
    setLoading(true);
    try {
      const res = await handleCredentialsRegister(data);

      if (!res) return; // Redirected

      if ('message' in res) {
        if (res.reverifyEmail) {
          return setResendVerifyEmailModalOpen(true);
        }

        if (res.field) {
          return form.setError(res.field as keyof RegisterSchema, {
            type: 'manual',
            message: res.message,
          });
        }

        return setFormError(res.message);
      }

      setSuccessModalOpen(true);
    } catch (error: any) {
      setFormError(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const prepareSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTurnstileLoading(true);
    setShowTurnstile(true);
    turnstile.current?.reset();
  };

  return (
    <>
      <ResendVerifyEmailModal
        email={formWatcher.email as string}
        open={resendVerifyEmailModalOpen}
        onOpenChange={setResendVerifyEmailModalOpen}
      />
      <RegisterSuccessModal
        email={formWatcher.email as string}
        open={successModalOpen}
        onOpenChange={setSuccessModalOpen}
      />
      <Card className="mx-auto w-full max-w-lg p-6 max-md:max-w-md max-md:px-0">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">
            {t('auth.register.title')}
          </CardTitle>
          <CardDescription>{t('auth.register.description')}</CardDescription>
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
            <form className="space-y-4" onSubmit={prepareSubmit}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('general.email')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="support@lukittu.com"
                        type="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('general.full_name')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="password">
                        {t('general.password')}
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            id="password"
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
                <PasswordIndicator password={form.watch('password')} />
              </div>
              <FormField
                control={form.control}
                name="terms"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel>
                        {t('auth.register.agree')}{' '}
                        <Link
                          className="text-primary"
                          href="https://lukittu.com/terms-of-service"
                          prefetch={false}
                        >
                          {t('auth.register.terms_of_service')}
                        </Link>{' '}
                        {t('auth.register.and')}{' '}
                        <Link
                          className="text-primary"
                          href="https://lukittu.com/privacy-policy"
                          prefetch={false}
                        >
                          {t('auth.register.privacy_policy')}
                        </Link>
                      </FormLabel>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {showTurnstile && (
                <Turnstile
                  ref={turnstile}
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                  onError={() => {
                    setTurnstileLoading(false);
                  }}
                  onSuccess={(token) => {
                    form.setValue('token', token);
                    form.handleSubmit(onSubmit)();
                    setTurnstileLoading(false);
                  }}
                />
              )}
              <LoadingButton
                className="w-full"
                pending={loading || turnstileLoading}
                type="submit"
              >
                {t('auth.register.button')}
              </LoadingButton>
              <div className="space-y-4">
                <div className="flex w-full items-center gap-4">
                  <Separator className="w-auto flex-grow" />
                  <span className="text-sm">
                    {t('general.or').toUpperCase()}
                  </span>
                  <Separator className="w-auto flex-grow" />
                </div>
                <LoginWithGoogleButton />
                <LoginWithGithubButton />
              </div>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between">
          <p className="text-sm">
            {t('auth.register.already_have_account')}{' '}
            <Link className="font-semibold text-primary" href="/auth/login">
              {t('general.login')}
            </Link>
          </p>
          <div className="flex gap-1">
            <ThemeSwitcher size="xs" />
            <LanguageSwitcher size="xs" />
          </div>
        </CardFooter>
      </Card>
    </>
  );
}
