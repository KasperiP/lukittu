'use client';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VariantProps } from 'class-variance-authority';
import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

interface LanguageSwitcherProps {
  variant?: VariantProps<typeof buttonVariants>['variant'];
  size?: VariantProps<typeof buttonVariants>['size'];
}

export function LanguageSwitcher({
  variant = 'ghost',
  size = 'icon',
}: LanguageSwitcherProps) {
  const t = useTranslations();
  const router = useRouter();

  const handleLanguageChange = (lang: string) => {
    document.cookie = `lang=${lang}; path=/`;
    router.refresh();
  };

  return (
    <DropdownMenu>
      <TooltipProvider disableHoverableContent>
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button size={size} variant={variant}>
                <Globe className="h-[1.2rem] w-[1.2rem] rotate-0 transition-all" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t('general.switch_language')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuItem onClick={() => handleLanguageChange('en')}>
          English
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleLanguageChange('fi')}>
          Finnish
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleLanguageChange('es')}>
          Spanish
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
