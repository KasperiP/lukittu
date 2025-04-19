'use client';
import { IProductsReleasesGetSuccessResponse } from '@/app/api/(dashboard)/products/releases/route';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ReleaseModalContext } from '@/providers/ReleasesModalProvider';
import { VariantProps } from 'class-variance-authority';
import { Edit, Ellipsis, Star, Trash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

interface ReleasesActionDropdownProps {
  release: IProductsReleasesGetSuccessResponse['releases'][number] | undefined;
  variant?: VariantProps<typeof buttonVariants>['variant'];
}

export const ReleasesActionDropdown = ({
  release,
  variant = 'ghost',
}: ReleasesActionDropdownProps) => {
  const t = useTranslations();
  const ctx = useContext(ReleaseModalContext);
  const { mutate } = useSWRConfig();

  if (!release) return null;

  const handleLatestRelease = async () => {
    try {
      if (release.status !== 'PUBLISHED') {
        return toast.error(t('validation.latest_release_must_be_published'));
      }

      const res = await ctx.setReleaseAsLatest(release);

      if ('message' in res) {
        toast.error(res.message);
      } else {
        toast.success(t('dashboard.releases.latest_release_updated'));
        mutate(
          (key) => Array.isArray(key) && key[0] === '/api/products/releases',
        );
      }
    } catch (error) {
      toast.error(t('general.error_occurred'));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant={variant}>
          <Ellipsis className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="font-medium" forceMount>
        <DropdownMenuItem
          className="hover:cursor-pointer"
          disabled={Boolean(
            release.latest ||
              release.status !== 'PUBLISHED' ||
              release.allowedLicenses.length,
          )}
          onClick={(e) => {
            e.stopPropagation();
            handleLatestRelease();
          }}
        >
          <Star className="mr-2 h-4 w-4" />
          {t('dashboard.releases.set_as_latest')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="hover:cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            ctx.setReleaseToEdit(release);
            ctx.setReleaseModalOpen(true);
          }}
        >
          <Edit className="mr-2 h-4 w-4" />
          {t('dashboard.releases.update_release')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-destructive hover:cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            ctx.setReleaseToDelete(release);
            ctx.setReleaseToDeleteModalOpen(true);
          }}
        >
          <Trash className="mr-2 h-4 w-4" />
          {t('dashboard.releases.delete_release')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
