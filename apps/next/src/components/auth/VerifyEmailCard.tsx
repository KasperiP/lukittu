'use client';
import { IAuthVerifyEmailResponse } from '@/app/api/(dashboard)/auth/verify-email/route';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CircleCheck, CircleX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LoadingSpinner } from '../shared/LoadingSpinner';

export default function VerifyEmailCard() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const [isError, setIsError] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      router.push('/auth/login');
      return;
    }

    (async () => {
      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: searchParams.get('token'),
          }),
        });

        const data = (await response.json()) as IAuthVerifyEmailResponse;

        if ('message' in data) {
          setIsError(true);
          setMessage(data.message);
          return;
        }

        setMessage(t('auth.verify_email.verification_success'));
      } catch (error: any) {
        setIsError(true);
        toast.error(error.message ?? t('general.error_occurred'));
      } finally {
        setLoading(false);
      }
    })();
  }, [router, searchParams, t]);

  return loading ? (
    <div className="fixed left-0 top-0 flex h-dvh w-dvw items-center justify-center bg-background">
      <LoadingSpinner size={38} />
    </div>
  ) : (
    <Card className="mx-auto w-full max-w-lg p-6 max-md:max-w-md max-md:px-0">
      <CardHeader className="space-y-2 text-center">
        <div className="flex items-center justify-center">
          {isError ? (
            <CircleX className="text-destructive" size={42} />
          ) : (
            <CircleCheck className="text-primary" size={42} />
          )}
        </div>
        <CardTitle className="text-2xl font-bold">
          {isError
            ? t('auth.verify_email.verification_failed_title')
            : t('auth.verify_email.verification_success_title')}
        </CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="w-full" asChild>
          <Link href="/auth/login">{t('general.back_to_login')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
