'use client';
import { IAuthSignOutResponse } from '@/app/api/(dashboard)/auth/sign-out/route';
import {
  ISessionsGetCurrentResponse,
  ISessionsGetCurrentSuccessResponse,
} from '@/app/api/(dashboard)/sessions/current/route';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { createContext, useEffect, useState } from 'react';
import { toast } from 'sonner';

export const AuthContext = createContext({
  session: null as ISessionsGetCurrentSuccessResponse['session'] | null,
  loading: true,
  setSession: ((
    session: ISessionsGetCurrentSuccessResponse['session'] | null,
  ) => {}) as React.Dispatch<
    React.SetStateAction<ISessionsGetCurrentSuccessResponse['session'] | null>
  >,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const t = useTranslations();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<
    ISessionsGetCurrentSuccessResponse['session'] | null
  >(null);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch('/api/sessions/current');
        if (!res.ok) {
          setSession(null);
          try {
            const response = await fetch('/api/auth/sign-out', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
            });

            const data = (await response.json()) as IAuthSignOutResponse;

            if ('message' in data) {
              toast.error(data.message);
            }

            return;
          } catch (error: any) {
            toast.error(error.message ?? t('general.error_occurred'));
          } finally {
            router.push('/auth/login');
          }
        }

        const data = (await res.json()) as ISessionsGetCurrentResponse;

        setSession(data.session);
      } catch (error: any) {
        toast.error(error.message ?? t('general.error_occurred'));
      }
    };

    fetchSession().finally(() => setLoading(false));
  }, [router, t]);

  if (loading || !session) {
    return (
      <div className="fixed left-0 top-0 flex h-dvh w-dvw items-center justify-center bg-background">
        <LoadingSpinner size={38} />
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        setSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
