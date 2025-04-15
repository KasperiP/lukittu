import { Button, buttonVariants } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/tailwind-helpers';
import { BlacklistModalContext } from '@/providers/BlacklistModalProvider';
import { CustomerModalContext } from '@/providers/CustomerModalProvider';
import { LicenseModalContext } from '@/providers/LicenseModalProvider';
import { MemberModalContext } from '@/providers/MemberModalProvider';
import { ProductModalContext } from '@/providers/ProductModalProvider';
import { ReleaseModalContext } from '@/providers/ReleasesModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { VariantProps } from 'class-variance-authority';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext } from 'react';

interface AddEntityButtonProps {
  entityType:
    | 'product'
    | 'customer'
    | 'member'
    | 'license'
    | 'blacklist'
    | 'release';
  displayText?: boolean;
  isTeamOwner?: boolean;
  variant?: VariantProps<typeof buttonVariants>['variant'];
}

export default function AddEntityButton({
  entityType,
  displayText = false,
  isTeamOwner = true,
  variant = 'default',
}: AddEntityButtonProps) {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);

  const productModalCtx = useContext(ProductModalContext);
  const customerModalCtx = useContext(CustomerModalContext);
  const memberModalCtx = useContext(MemberModalContext);
  const licenseModalCtx = useContext(LicenseModalContext);
  const blacklistModalCtx = useContext(BlacklistModalContext);
  const releaseModalCtx = useContext(ReleaseModalContext);

  const translationKey = (() => {
    switch (entityType) {
      case 'product':
        return 'dashboard.products.add_product';
      case 'customer':
        return 'dashboard.customers.add_customer';
      case 'member':
        return 'dashboard.members.new_member';
      case 'license':
        return 'dashboard.licenses.add_license';
      case 'blacklist':
        return 'dashboard.blacklist.add_blacklist';
      case 'release':
        return 'dashboard.releases.create_release';
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  })();

  const isDisabled =
    entityType === 'member' ? !isTeamOwner : !teamCtx.selectedTeam;

  const openModal = () => {
    switch (entityType) {
      case 'product':
        return productModalCtx.setProductModalOpen(true);
      case 'customer':
        return customerModalCtx.setCustomerModalOpen(true);
      case 'member':
        return memberModalCtx.setMemberModalOpen(true);
      case 'license':
        return licenseModalCtx.setLicenseModalOpen(true);
      case 'blacklist':
        return blacklistModalCtx.setBlacklistModalOpen(true);
      case 'release':
        return releaseModalCtx.setReleaseModalOpen(true);
    }
  };

  const button = (
    <Button
      className="ml-auto flex gap-2"
      disabled={isDisabled}
      size="sm"
      variant={variant}
      onClick={openModal}
    >
      <Plus className="h-4 w-4" />
      <span
        className={cn('max-md:hidden', {
          'max-md:block': displayText,
        })}
      >
        {t(translationKey)}
      </span>
    </Button>
  );

  if (entityType === 'member' && !isTeamOwner) {
    return (
      <TooltipProvider disableHoverableContent>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <span>{button}</span>
          </TooltipTrigger>
          <TooltipContent>
            <span className="font-normal">
              {t('dashboard.members.only_for_owners')}
            </span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
