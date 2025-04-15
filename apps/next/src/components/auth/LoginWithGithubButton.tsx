import githubSvg from '@/../public/icons/github.svg';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Button } from '../ui/button';

export default function LoginWithGithubButton() {
  const t = useTranslations();

  const handleGithubLogin = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    const githubUrl = new URL('https://github.com/login/oauth/authorize');
    githubUrl.searchParams.append(
      'client_id',
      process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
    );
    githubUrl.searchParams.append(
      'redirect_uri',
      process.env.NEXT_PUBLIC_GITHUB_REDIRECT_URI!,
    );
    githubUrl.searchParams.append('scope', 'user:email read:user');

    const urlString = githubUrl.toString();

    window.location.href = urlString;
  };

  return (
    <Button
      className="flex w-full items-center gap-2"
      type="button"
      variant="outline"
      onClick={handleGithubLogin}
    >
      <Image
        alt="GitHub logo"
        className="dark:invert dark:filter"
        height={24}
        src={githubSvg}
        width={24}
      />
      {t('general.continue_with_github')}
    </Button>
  );
}
