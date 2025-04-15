'use client';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/tailwind-helpers';
import { DropdownMenuArrow } from '@radix-ui/react-dropdown-menu';
import { ChevronDown, LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Messages } from '../../../../global';
import { HighlightText } from './Menu';

type Submenu = {
  href: string;
  translation: keyof Messages['dashboard']['navigation'];
  active: boolean;
};

interface CollapseMenuButtonProps {
  icon: LucideIcon;
  translation: keyof Messages['dashboard']['navigation'];
  active: boolean;
  submenus: Submenu[];
  isOpen: boolean | undefined;
  onClick?: () => void;
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  search?: string;
}

export function CollapseMenuButton({
  icon: Icon,
  translation,
  active,
  submenus,
  isOpen,
  onClick,
  collapsed,
  onCollapse,
  search = '',
}: CollapseMenuButtonProps) {
  const t = useTranslations();

  return isOpen ? (
    <Collapsible
      className="w-full"
      open={!collapsed}
      onOpenChange={(open) => onCollapse && onCollapse(open)}
    >
      <CollapsibleTrigger
        className="mb-1 [&[data-state=open]>div>div>svg]:rotate-180"
        asChild
      >
        <Button
          className="h-10 w-full justify-start"
          variant={active ? 'secondary' : 'ghost'}
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center">
              <span className="mr-4">
                <Icon size={18} />
              </span>
              <p
                className={cn(
                  'max-w-[150px] truncate',
                  isOpen
                    ? 'translate-x-0 opacity-100'
                    : '-translate-x-96 opacity-0',
                )}
              >
                <HighlightText
                  highlight={search}
                  text={t(`dashboard.navigation.${translation}`)}
                />
              </p>
            </div>
            <ChevronDown className="h-4 w-4 transition-transform duration-200" />
          </div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1">
        {submenus.map((submenu) => (
          <Button
            key={submenu.href}
            className="h-10 w-full justify-start pl-10"
            variant={submenu.active ? 'secondary' : 'ghost'}
            asChild
          >
            <Link href={submenu.href} onClick={onClick}>
              <p className="truncate">
                <HighlightText
                  highlight={search}
                  text={t(`dashboard.navigation.${submenu.translation}`)}
                />
              </p>
            </Link>
          </Button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  ) : (
    <DropdownMenu>
      <TooltipProvider disableHoverableContent>
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                className="mb-1 h-10 w-full justify-start"
                variant={active ? 'secondary' : 'ghost'}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center">
                    <span className={cn(isOpen === false ? '' : 'mr-4')}>
                      <Icon size={18} />
                    </span>
                    <p
                      className={cn(
                        'max-w-[200px] truncate',
                        isOpen === false ? 'opacity-0' : 'opacity-100',
                      )}
                    >
                      {t(`dashboard.navigation.${translation}`)}
                    </p>
                  </div>
                </div>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent align="start" alignOffset={2} side="right">
            {t(`dashboard.navigation.${translation}`)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent
        align="start"
        side="right"
        sideOffset={25}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuLabel className="max-w-[190px] truncate">
          {t(`dashboard.navigation.${translation}`)}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {submenus.map(({ href, translation }, index) => (
          <DropdownMenuItem key={index} asChild>
            <Link className="cursor-pointer" href={href}>
              <p className="max-w-[180px] truncate">
                {t(`dashboard.navigation.${translation}`)}
              </p>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuArrow className="fill-border" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
