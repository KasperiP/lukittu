'use client';
import logoTextDark from '@/../public/logo_text_dark.svg';
import logoTextLight from '@/../public/logo_text_light.svg';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { MenuIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu } from './Menu';
import { TeamSelector } from './TeamSelector';

export function SheetMenu() {
  const t = useTranslations();

  const [logo, setLogo] = useState(logoTextDark);
  const [open, setOpen] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    setLogo(theme.theme === 'light' ? logoTextDark : logoTextLight);
  }, [theme.theme]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button className="h-8" size="icon" variant="ghost">
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex h-full flex-col px-3 sm:w-72" side="left">
        <SheetTitle>
          <VisuallyHidden.Root>{t('general.menu')}</VisuallyHidden.Root>
        </SheetTitle>
        <SheetHeader>
          <Button
            className="flex items-center justify-center pb-2 pt-1 ring-0 focus-visible:ring-0"
            variant="link"
          >
            <Link className="flex items-center gap-2" href="/dashboard">
              <Image alt="Lukittu" height={38} src={logo} priority />
            </Link>
          </Button>
        </SheetHeader>
        <TeamSelector fullWidth />
        <Separator />
        <Menu topSpacing={false} isOpen onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
