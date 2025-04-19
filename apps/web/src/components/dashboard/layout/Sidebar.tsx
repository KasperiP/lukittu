'use client';
import logoTextDark from '@/../public/logo_text_dark.svg';
import logoTextLight from '@/../public/logo_text_light.svg';
import logoCircle from '@/../public/lukittu_logo.svg';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/tailwind-helpers';
import { SidebarContext } from '@/providers/SidebarProvider';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import Link from 'next/link';
import { useContext, useEffect, useState } from 'react';
import { Menu } from './Menu';

export function Sidebar() {
  const [logo, setLogo] = useState(logoTextDark);
  const theme = useTheme();
  const ctx = useContext(SidebarContext);

  useEffect(() => {
    setLogo(theme.theme === 'light' ? logoTextDark : logoTextLight);
  }, [theme.theme]);

  return (
    <aside
      className={cn(
        'sticky left-0 top-0 z-20 h-dvh shrink-0 -translate-x-full transform-gpu bg-background transition-[width] duration-300 ease-in-out max-lg:hidden lg:translate-x-0',
        ctx.open === false ? 'w-[90px]' : 'w-72',
      )}
    >
      <div className="relative flex h-full flex-col overflow-y-auto border-r px-3 py-4">
        <Button
          className={cn(
            'mb-1 ring-0 transition-transform duration-300 ease-in-out focus-visible:ring-0',
            ctx.open === false ? 'translate-x-1' : 'translate-x-0',
          )}
          tabIndex={0}
          variant="link"
          asChild
        >
          <Link
            className="flex items-center gap-2"
            href="/dashboard"
            tabIndex={0}
          >
            <Image
              alt="Lukittu"
              className={ctx.open ? '' : 'hidden'}
              height={38}
              src={logo}
              priority
            />
            <Image
              alt="Lukittu"
              className={ctx.open ? 'hidden' : ''}
              height={33}
              src={logoCircle}
              priority
            />
          </Link>
        </Button>
        <Menu isOpen={ctx.open} />
      </div>
    </aside>
  );
}
