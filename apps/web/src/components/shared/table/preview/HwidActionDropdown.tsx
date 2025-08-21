'use client';
import { IHwidUpdateResponse } from '@/app/api/(dashboard)/licenses/[slug]/hwid/[hwidId]/route';
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

interface HwidActionDropdownProps {
  hwid: {
    id: string;
    hwid: string;
    status: 'active' | 'inactive' | 'forgotten';
  };
  licenseId: string;
  variant?: VariantProps<typeof buttonVariants>['variant'];
}

export const HwidActionDropdown = ({
  hwid,
  licenseId,
  variant = 'ghost',
}: HwidActionDropdownProps) => {
  const t = useTranslations();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(hwid.hwid);
    toast.success(t('general.copied_to_clipboard'));
  };

  const handleForgetToggle = async () => {
    if (isUpdating) return;

    setIsUpdating(true);
    const newForgotten = hwid.status !== 'forgotten';

    try {
      const response = await fetch(
        `/api/licenses/${licenseId}/hwid/${hwid.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ forgotten: newForgotten }),
        },
      );

      const data = (await response.json()) as IHwidUpdateResponse;

      if ('message' in data && !('success' in data)) {
        toast.error(data.message);
        return;
      }

      toast.success(
        newForgotten
          ? t('dashboard.hwid.hwid_forgotten')
          : t('dashboard.hwid.hwid_remembered'),
      );

      mutate(
        (key) =>
          Array.isArray(key) &&
          (key[0] === `/api/licenses/${licenseId}/hwid` ||
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
          {hwid.status === 'forgotten' ? (
            <>
              <Eye className="mr-2 h-4 w-4" />
              {t('dashboard.hwid.remember_hwid')}
            </>
          ) : (
            <>
              <EyeOff className="mr-2 h-4 w-4" />
              {t('dashboard.hwid.forget_hwid')}
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
