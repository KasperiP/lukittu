import googleSvg from '@/../public/icons/google.svg';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Button } from '../ui/button';

export default function LoginWithGoogleButton() {
  const t = useTranslations();

  const handleGoogleLogin = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleUrl.searchParams.append(
      'client_id',
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
    );
    googleUrl.searchParams.append(
      'redirect_uri',
      process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI!,
    );
    googleUrl.searchParams.append('response_type', 'code');
    googleUrl.searchParams.append('scope', 'email profile');

    const urlString = googleUrl.toString();

    window.location.href = urlString;
  };

  return (
    <Button
      className="flex w-full items-center gap-2"
      type="button"
      variant="outline"
      onClick={handleGoogleLogin}
    >
      <Image alt="Google Chrome logo" height={24} src={googleSvg} width={24} />
      {t('general.continue_with_google')}
    </Button>
  );
}
