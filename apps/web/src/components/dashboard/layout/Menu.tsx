/* eslint-disable @typescript-eslint/no-unnecessary-condition */
'use client';
import ConfettiButton from '@/components/shared/ConfettiButton';
import LoadingButton from '@/components/shared/LoadingButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getMenuList } from '@/lib/utils/navigation-helpers';
import { cn } from '@/lib/utils/tailwind-helpers';
import { AuthContext } from '@/providers/AuthProvider';
import { TeamContext } from '@/providers/TeamProvider';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CreditCard,
  Ellipsis,
  Frown,
  Rocket,
  Search,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { Messages } from '../../../../global';
import { CollapseMenuButton } from './CollapseMenuButton';

export const HighlightText = ({
  text,
  highlight,
}: {
  text: string;
  highlight: string;
}) => {
  if (!highlight.trim()) return <>{text}</>;

  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span key={i} className="bg-yellow-500/20">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
};

interface MenuProps {
  isOpen: boolean | undefined;
  topSpacing?: boolean;
  onClose?: () => void;
}

interface FlatMenuItem {
  href: string;
  translation: string;
  isSubmenu?: boolean;
  parentTranslation?: string;
}

export function Menu({ isOpen, topSpacing = true, onClose }: MenuProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const menuList = getMenuList(pathname);
  const router = useRouter();
  const teamCtx = useContext(TeamContext);
  const authCtx = useContext(AuthContext);

  const selectedTeam = teamCtx.teams.find(
    (team) => team.id === teamCtx.selectedTeam,
  );

  const isActiveSubscription = selectedTeam?.subscription?.status === 'active';

  const isTeamOwner = selectedTeam?.ownerId === authCtx.session?.user?.id;

  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<
    Record<keyof Messages['dashboard']['navigation'], boolean>
  >(
    menuList.reduce(
      (acc, group) => {
        group.menus.forEach((menu) => {
          const hasActiveSubmenu = menu.submenus?.some(
            (submenu) => submenu.active,
          );

          acc[menu.translation] = !hasActiveSubmenu;
        });
        return acc;
      },
      {} as Record<keyof Messages['dashboard']['navigation'], boolean>,
    ),
  );
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const filteredMenuList = menuList
    .map((group) => ({
      ...group,
      menus: group.menus.filter((menu) => {
        const menuMatches = t(`dashboard.navigation.${menu.translation}`)
          .toLowerCase()
          .includes(searchTerm.toLowerCase());

        const subMenuMatches =
          menu.submenus?.some((submenu) =>
            t(`dashboard.navigation.${submenu.translation}`)
              .toLowerCase()
              .includes(searchTerm.toLowerCase()),
          ) ?? false;

        return menuMatches || subMenuMatches;
      }),
    }))
    .filter((group) => group.menus.length > 0);

  // Create flattened list including submenus
  const flattenedMenuItems: FlatMenuItem[] = filteredMenuList.flatMap(
    ({ menus }) =>
      menus.flatMap((menu) => [
        { href: menu.href, translation: menu.translation },
        ...(menu.submenus?.map((submenu) => ({
          href: submenu.href,
          translation: submenu.translation,
          isSubmenu: true,
          parentTranslation: menu.translation,
        })) ?? []),
      ]),
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open dialog with Ctrl+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchDialogOpen(true);
      }

      if (searchDialogOpen) {
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setSelectedIndex((prev) =>
              Math.min(prev + 1, flattenedMenuItems.length - 1),
            );
            break;
          case 'ArrowUp':
            e.preventDefault();
            setSelectedIndex((prev) => Math.max(prev - 1, -1));
            break;
          case 'Enter':
            e.preventDefault();
            if (selectedIndex >= 0) {
              const selectedItem = flattenedMenuItems[selectedIndex];
              setSearchDialogOpen(false);
              setSearchTerm('');
              onClose?.();
              router.push(selectedItem.href);
            }
            break;
          case 'Escape':
            setSearchDialogOpen(false);
            setSelectedIndex(-1);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchDialogOpen, flattenedMenuItems, selectedIndex, onClose, router]);

  // Reset selected index when search term changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [searchTerm]);

  const handleSearch = (searchValue: string) => {
    setSearchTerm(searchValue);

    const newCollapsed = { ...collapsed };

    if (searchValue) {
      menuList.forEach((group) => {
        group.menus.forEach((menu) => {
          const menuMatches = t(`dashboard.navigation.${menu.translation}`)
            .toLowerCase()
            .includes(searchValue.toLowerCase());

          const subMenuMatches = menu.submenus?.some((submenu) =>
            t(`dashboard.navigation.${submenu.translation}`)
              .toLowerCase()
              .includes(searchValue.toLowerCase()),
          );

          newCollapsed[menu.translation] = !(menuMatches || subMenuMatches);
        });
      });
    } else {
      menuList.forEach((group) => {
        group.menus.forEach((menu) => {
          newCollapsed[menu.translation] = true;
        });
      });
    }

    setCollapsed(newCollapsed);
  };

  const handleCollapse = (
    translation: keyof Messages['dashboard']['navigation'],
  ) => {
    setCollapsed((prev) => ({
      ...prev,
      [translation]: !prev[translation],
    }));
  };

  const handleSubscriptionManagement = async () => {
    window.location.href = '/api/billing/subscription-management';
  };

  const handleLinkClick = () => {
    onClose?.();
    setSearchTerm('');
  };

  return (
    <ScrollArea className="h-full [&>div>div[style]]:!block [&>div>div[style]]:h-full">
      <nav className={cn('flex h-full w-full flex-col', topSpacing && 'pt-8')}>
        <div className="px-2 pb-2">
          {isOpen ? (
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="w-full border-none bg-muted/50 pl-8 !shadow-none outline-none ring-0 hover:bg-muted/70 focus:bg-muted/70 focus-visible:ring-0 focus-visible:ring-transparent"
                placeholder="Search menu..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
          ) : (
            <TooltipProvider>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <Button
                    className="w-full"
                    size="icon"
                    variant="ghost"
                    onClick={() => setSearchDialogOpen(true)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Search menu</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <ResponsiveDialog
            open={searchDialogOpen}
            onOpenChange={setSearchDialogOpen}
          >
            <ResponsiveDialogTitle>
              <div className="sr-only">{t('general.search')}</div>
            </ResponsiveDialogTitle>
            <ResponsiveDialogContent className="sm:max-w-[425px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="w-full border-none bg-muted/50 pl-8 !shadow-none outline-none ring-0 hover:bg-muted/70 focus:bg-muted/70 focus-visible:ring-0 focus-visible:ring-transparent"
                  placeholder="Search menu..."
                  value={searchTerm}
                  autoFocus
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
              {searchTerm && flattenedMenuItems.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Frown className="h-4 w-4" />
                  {t('general.no_results')}
                </div>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  {flattenedMenuItems.map((item, index) => (
                    <Button
                      key={`${item.translation}-${index}`}
                      className={cn(
                        'w-full justify-start',
                        index === selectedIndex && 'bg-accent',
                        item.isSubmenu && 'pl-8',
                      )}
                      variant="ghost"
                      asChild
                      onClick={() => {
                        setSearchDialogOpen(false);
                        setSearchTerm('');
                        onClose?.();
                      }}
                    >
                      <Link href={item.href}>
                        {item.isSubmenu && (
                          <span className="mr-2 text-sm text-muted-foreground">
                            {t(
                              `dashboard.navigation.${item.parentTranslation}` as any,
                            )}{' '}
                            →
                          </span>
                        )}
                        <HighlightText
                          highlight={searchTerm}
                          text={t(
                            `dashboard.navigation.${item.translation}` as any,
                          )}
                        />
                      </Link>
                    </Button>
                  ))}
                </div>
              )}
            </ResponsiveDialogContent>
          </ResponsiveDialog>
        </div>
        {isOpen && searchTerm && filteredMenuList.length === 0 && (
          <div className="flex w-full flex-col items-center justify-center gap-1 py-4 text-sm text-muted-foreground">
            <Frown className="mr-2 h-4 w-4" />
            {t('general.no_results')}
          </div>
        )}
        <div className="flex-1 overflow-y-auto overflow-x-clip">
          <ul className="flex flex-col items-start space-y-1 px-2">
            {filteredMenuList.map(({ groupTranslation, menus }, index) => (
              <li
                key={index}
                className={cn('w-full', groupTranslation ? 'pt-5' : '')}
              >
                {(isOpen && groupTranslation) || isOpen === undefined ? (
                  <p className="max-w-[248px] truncate px-4 pb-2 text-sm font-medium text-muted-foreground">
                    {t(
                      `dashboard.navigation.${groupTranslation as Exclude<typeof groupTranslation, ''>}`,
                    )}
                  </p>
                ) : !isOpen && groupTranslation ? (
                  <TooltipProvider>
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger className="w-full">
                        <div className="flex w-full items-center justify-center">
                          <Ellipsis className="h-5 w-5" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>
                          {t(
                            `dashboard.navigation.${groupTranslation as Exclude<typeof groupTranslation, ''>}`,
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
                {menus.map(
                  (
                    { href, translation, icon: Icon, active, submenus },
                    index,
                  ) =>
                    submenus.length === 0 ? (
                      <div key={index} className="w-full">
                        <TooltipProvider disableHoverableContent>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <Button
                                className="mb-1 h-10 w-full justify-start"
                                variant={active ? 'secondary' : 'ghost'}
                                asChild
                                onClick={onClose}
                              >
                                <Link href={href} onClick={handleLinkClick}>
                                  <span
                                    className={cn(
                                      isOpen === false ? '' : 'mr-4',
                                    )}
                                  >
                                    <Icon size={18} />
                                  </span>
                                  <p
                                    className={cn(
                                      'max-w-[200px] truncate',
                                      isOpen === false
                                        ? '-translate-x-96 opacity-0'
                                        : 'translate-x-0 opacity-100',
                                    )}
                                  >
                                    <HighlightText
                                      highlight={searchTerm}
                                      text={t(
                                        `dashboard.navigation.${translation}`,
                                      )}
                                    />
                                  </p>
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            {isOpen === false && (
                              <TooltipContent side="right">
                                {t(`dashboard.navigation.${translation}`)}
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    ) : (
                      <div key={index} className="w-full">
                        <CollapseMenuButton
                          active={active}
                          collapsed={collapsed[translation]}
                          icon={Icon}
                          isOpen={isOpen}
                          search={searchTerm}
                          submenus={submenus}
                          translation={translation}
                          onClick={handleLinkClick}
                          onCollapse={() => handleCollapse(translation)}
                        />
                      </div>
                    ),
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="px-2 pb-2">
          <div
            className={cn('w-full', {
              hidden: isOpen === false,
            })}
          >
            <Card className="w-full max-w-sm overflow-hidden transition-all duration-300 ease-in-out">
              <CardHeader
                className="cursor-pointer p-4"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold">
                    {isActiveSubscription
                      ? selectedTeam.subscription?.plan
                      : t('dashboard.subscriptions.free_plan')}
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <Badge
                      className="uppercase"
                      variant={isActiveSubscription ? 'primary' : 'secondary'}
                    >
                      {isActiveSubscription
                        ? t('general.active')
                        : t('general.basic')}
                    </Badge>
                    {isExpanded ? (
                      <ChevronUpIcon className="h-5 w-5" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5" />
                    )}
                  </div>
                </div>
              </CardHeader>
              <div
                className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-96' : 'max-h-0'}`}
              >
                <CardContent className="px-4 pb-0 pt-0">
                  <CardDescription className="mb-4">
                    {isActiveSubscription
                      ? t('dashboard.subscriptions.using_paid_plan')
                      : t('dashboard.subscriptions.using_free_description')}
                  </CardDescription>
                </CardContent>
                <CardFooter className="px-4">
                  {!isActiveSubscription ? (
                    <TooltipProvider>
                      <Tooltip delayDuration={50}>
                        <TooltipTrigger asChild>
                          <div className="w-full">
                            <ConfettiButton
                              className="flex w-full items-center gap-2"
                              disabled={!isTeamOwner}
                              onClick={handleSubscriptionManagement}
                            >
                              <Rocket className="h-5 w-5" />
                              {t('dashboard.subscriptions.upgrade_to_premium')}
                            </ConfettiButton>
                          </div>
                        </TooltipTrigger>
                        {!isTeamOwner && (
                          <TooltipContent>
                            {t('dashboard.members.only_for_owners')}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <TooltipProvider>
                      <Tooltip delayDuration={50}>
                        <TooltipTrigger asChild>
                          <div className="w-full">
                            <LoadingButton
                              className="flex w-full items-center gap-2"
                              disabled={!isTeamOwner}
                              size="sm"
                              onClick={handleSubscriptionManagement}
                            >
                              <CreditCard className="h-5 w-5" />
                              {t('dashboard.subscriptions.manage_subscription')}
                            </LoadingButton>
                          </div>
                        </TooltipTrigger>
                        {!isTeamOwner && (
                          <TooltipContent>
                            {t('dashboard.members.only_for_owners')}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </CardFooter>
              </div>
            </Card>
          </div>
          <TooltipProvider disableHoverableContent>
            <Tooltip delayDuration={100}>
              <TooltipTrigger className="w-fit" asChild>
                <div
                  className={cn('w-auto', {
                    hidden: isOpen,
                  })}
                >
                  <Button
                    className="flex w-full items-center justify-center"
                    size="sm"
                  >
                    {isActiveSubscription ? (
                      <CreditCard className="h-5 w-5" />
                    ) : (
                      <Rocket className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </TooltipTrigger>
              {isOpen === false && (
                <TooltipContent side="right">
                  {isActiveSubscription
                    ? t('dashboard.subscriptions.manage_subscription')
                    : t('dashboard.subscriptions.upgrade_to_premium')}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </nav>
    </ScrollArea>
  );
}
