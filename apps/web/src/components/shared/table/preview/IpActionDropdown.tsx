'use client';
import { IIpUpdateResponse } from '@/app/api/(dashboard)/licenses/[slug]/ip-address/[ipId]/route';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VariantProps } from 'class-variance-authority';
import { Copy, Ellipsis, Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { mutate } from 'swr';

interface IpActionDropdownProps {
  ip: {
    id: string;
    ip: string;
    status: 'active' | 'inactive' | 'forgotten';
  };
  licenseId: string;
  variant?: VariantProps<typeof buttonVariants>['variant'];
}

export const IpActionDropdown = ({
  ip,
  licenseId,
  variant = 'ghost',
}: IpActionDropdownProps) => {
  const t = useTranslations();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(ip.ip);
    toast.success(t('general.copied_to_clipboard'));
  };

  const handleForgetToggle = async () => {
    if (isUpdating) return;

    setIsUpdating(true);
    const newForgotten = ip.status !== 'forgotten';

    try {
      const response = await fetch(
        `/api/licenses/${licenseId}/ip-address/${ip.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ forgotten: newForgotten }),
        },
      );

      const data = (await response.json()) as IIpUpdateResponse;

      if ('message' in data && !('success' in data)) {
        toast.error(data.message);
        return;
      }

      toast.success(
        newForgotten
          ? t('dashboard.ip.ip_forgotten')
          : t('dashboard.ip.ip_remembered'),
      );

      mutate(
        (key) =>
          Array.isArray(key) &&
          (key[0] === `/api/licenses/${licenseId}/ip-address` ||
            key[0] === '/api/licenses'),
      );
    } catch (_error) {
      toast.error(t('general.server_error'));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-8 w-8 p-0"
          disabled={isUpdating}
          size="sm"
          variant={variant}
        >
          <Ellipsis className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="font-medium" forceMount>
        <DropdownMenuItem
          className="hover:cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          {t('general.click_to_copy')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="hover:cursor-pointer"
          disabled={isUpdating}
          onClick={(e) => {
            e.stopPropagation();
            handleForgetToggle();
          }}
        >
          {ip.status === 'forgotten' ? (
            <>
              <Eye className="mr-2 h-4 w-4" />
              {t('dashboard.ip.remember_ip')}
            </>
          ) : (
            <>
              <EyeOff className="mr-2 h-4 w-4" />
              {t('dashboard.ip.forget_ip')}
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
