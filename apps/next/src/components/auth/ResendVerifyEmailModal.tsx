import { IAuthResendVerifyEmailResponse } from '@/app/api/(dashboard)/auth/resend-verify-email/route';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import LoadingButton from '../shared/LoadingButton';

interface ResendVerifyEmailModalProps {
  open: boolean;
  onOpenChange: (boolean: boolean) => void;
  email: string;
}

export default function ResendVerifyEmailModal({
  open,
  onOpenChange,
  email,
}: ResendVerifyEmailModalProps) {
  const t = useTranslations();
  const [response, setResponse] = useState<{
    isError: boolean;
    message?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleResendVerifyEmail = async (email: string) => {
    const response = await fetch('/api/auth/resend-verify-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const data = (await response.json()) as IAuthResendVerifyEmailResponse;

    return data;
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await handleResendVerifyEmail(email);

      if ('message' in response) {
        setResponse({
          isError: true,
          message: response.message,
        });
      } else {
        setResponse({
          isError: false,
        });
      }
    } catch (error: any) {
      setResponse({
        isError: true,
        message: error.message ?? t('general.error_occurred'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[625px]">
        {response ? (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>
                {response.isError
                  ? t('auth.emails.sending_failed_title')
                  : t('auth.resend_verify.title')}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {response.isError
                  ? response.message
                  : t.rich('auth.resend_verify.description', {
                      email,
                      strong: (children) => <strong>{children}</strong>,
                    })}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ResponsiveDialogFooter>
              <div>
                <LoadingButton
                  className="w-full"
                  type="submit"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  {t('general.close')}
                </LoadingButton>
              </div>
            </ResponsiveDialogFooter>
          </>
        ) : (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>
                {t('auth.verify_email.title')}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {t('auth.verify_email.description')}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ResponsiveDialogFooter>
              <form onSubmit={onSubmit}>
                <LoadingButton
                  className="w-full"
                  pending={loading}
                  type="submit"
                >
                  {t('auth.verify_email.resend_email')}
                </LoadingButton>
              </form>
            </ResponsiveDialogFooter>
          </>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
