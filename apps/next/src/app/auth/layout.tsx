import { AuthLogo } from '@/components/shared/AuthLogo';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default async function AuthLayout({ children }: AuthLayoutProps) {
  const sessionId = (await cookies()).get('session')?.value;

  if (sessionId) {
    redirect('/dashboard');
  }

  return (
    <div className="relative my-14 flex w-full flex-col justify-start bg-background p-2 max-md:my-7">
      <AuthLogo />
      <div className="w-full">{children}</div>
    </div>
  );
}
