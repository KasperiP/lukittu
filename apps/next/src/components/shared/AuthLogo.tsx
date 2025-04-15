'use client';
import logoTextDark from '@/../public/logo_text_dark.svg';
import logoTextLight from '@/../public/logo_text_light.svg';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import { useEffect, useState } from 'react';

export const AuthLogo = () => {
  const theme = useTheme();
  const [logo, setLogo] = useState(logoTextDark);

  useEffect(() => {
    setLogo(theme.theme === 'light' ? logoTextDark : logoTextLight);
  }, [theme.theme]);

  return (
    <div className="mx-auto mb-4 w-full max-w-lg px-12 max-md:max-w-md max-md:px-6">
      <Image
        alt="Logo"
        className="pointer-events-none select-none"
        src={logo}
        width={140}
      />
    </div>
  );
};
