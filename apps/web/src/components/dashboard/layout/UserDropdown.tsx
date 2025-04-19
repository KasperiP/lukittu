'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
import { getInitials } from '@/lib/utils/text-helpers';
import { AuthContext } from '@/providers/AuthProvider';
import { LogOut, UserIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useContext, useMemo } from 'react';

export function UserDropdown() {
  const t = useTranslations();
  const router = useRouter();
  const authCtx = useContext(AuthContext);

  const user = useMemo(() => authCtx.session?.user, [authCtx]);

  const handleSignOut = async () => {
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    router.push('/auth/login');
  };

  return (
    <DropdownMenu>
      <TooltipProvider disableHoverableContent>
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                className="relative h-8 w-8 rounded-full"
                variant="default"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.imageUrl!} asChild>
                    {user?.imageUrl && (
                      <Image alt="Avatar" src={user.imageUrl} fill />
                    )}
                  </AvatarImage>
                  <AvatarFallback className="bg-transparent">
                    {getInitials(user?.fullName ?? '??')}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('general.profile')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent
        align="end"
        className="w-56"
        forceMount
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user?.fullName ?? 'N/A'}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user?.email ?? 'N/A'}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem className="hover:cursor-pointer" asChild>
            <Link className="flex items-center" href="/dashboard/profile">
              <UserIcon className="mr-3 h-4 w-4 text-muted-foreground" />
              {t('general.profile')}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="hover:cursor-pointer"
          onClick={handleSignOut}
        >
          <LogOut className="mr-3 h-4 w-4 text-muted-foreground" />
          {t('general.sign_out')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
