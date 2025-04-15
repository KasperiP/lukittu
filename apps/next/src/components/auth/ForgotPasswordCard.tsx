'use client';
import { IAuthForgotPasswordResponse } from '@/app/api/(dashboard)/auth/forgot-password/route';
import ForgotPasswordSuccessModal from '@/components/auth/ForgotPasswordSuccessModal';
import LoadingButton from '@/components/shared/LoadingButton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  IForgotPasswordSchema,
  forgotPasswordSchema,
} from '@/lib/validation/auth/forgot-password-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import { ThemeSwitcher } from '../shared/ThemeSwitcher';

export default function ForgotPasswordCard() {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  const form = useForm<IForgotPasswordSchema>({
    resolver: zodResolver(forgotPasswordSchema(t)),
    defaultValues: {
      email: '',
    },
  });

  const formWatcher = useWatch({
    control: form.control,
    defaultValue: form.getValues(),
  });

  useEffect(() => {
    setFormError(null);
  }, [formWatcher]);

  const handleForgotPassword = async (payload: IForgotPasswordSchema) => {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as IAuthForgotPasswordResponse;

    return data;
  };

  const onSubmit = async (data: IForgotPasswordSchema) => {
    setLoading(true);
    try {
      const res = await handleForgotPassword(data);
      if ('message' in res) {
        if (res.field) {
          return form.setError(res.field as keyof IForgotPasswordSchema, {
            type: 'manual',
            message: res.message,
          });
        }
        return setFormError(res.message);
      }

      setSuccessModalOpen(true);
    } catch (error: any) {
      toast.error(error.message ?? t('general.server_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ForgotPasswordSuccessModal
        email={formWatcher.email as string}
        open={successModalOpen}
        onOpenChange={setSuccessModalOpen}
      />
      <Card className="mx-auto w-full max-w-lg p-6 max-md:max-w-md max-md:px-0">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">
            {t('auth.forgot_password.title')}
          </CardTitle>
          <CardDescription>
            {t('auth.forgot_password.description')}
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
              <LoadingButton className="w-full" pending={loading} type="submit">
                {t('auth.reset_password.send_reset_email')}
              </LoadingButton>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between">
          <p className="text-sm">
            {t('auth.forgot_password.remember_password')}{' '}
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
