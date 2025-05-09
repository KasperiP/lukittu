import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/tailwind-helpers';
import { BlacklistModalContext } from '@/providers/BlacklistModalProvider';
import { BranchModalContext } from '@/providers/BranchModalProvider';
import { CustomerModalContext } from '@/providers/CustomerModalProvider';
import { LicenseModalContext } from '@/providers/LicenseModalProvider';
import { MemberModalContext } from '@/providers/MemberModalProvider';
import { ProductModalContext } from '@/providers/ProductModalProvider';
import { ReleaseModalContext } from '@/providers/ReleasesModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { VariantProps } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext } from 'react';

type EntityConfig = {
  type:
    | 'product'
    | 'customer'
    | 'member'
    | 'license'
    | 'blacklist'
    | 'release'
    | 'branch';
  translationKey: string;
};

interface AddEntityDropdownProps {
  entities: EntityConfig[];
  isTeamOwner?: boolean;
  variant?: VariantProps<typeof buttonVariants>['variant'];
  buttonText?: string;
}

export default function AddEntityDropdown({
  entities,
  isTeamOwner = true,
  variant = 'default',
  buttonText,
}: AddEntityDropdownProps) {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);

  const productModalCtx = useContext(ProductModalContext);
  const customerModalCtx = useContext(CustomerModalContext);
  const memberModalCtx = useContext(MemberModalContext);
  const licenseModalCtx = useContext(LicenseModalContext);
  const blacklistModalCtx = useContext(BlacklistModalContext);
  const releaseModalCtx = useContext(ReleaseModalContext);
  const branchModalCtx = useContext(BranchModalContext);

  const getTranslationKey = (entityType: EntityConfig['type']) => {
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
      case 'branch':
        return 'dashboard.releases.create_branch';
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  };

  const openModal = (entityType: EntityConfig['type']) => {
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
      case 'branch':
        return branchModalCtx.setBranchModalOpen(true);
    }
  };

  const isDisabled = !teamCtx.selectedTeam;
  const displayText = buttonText || t('general.create');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn('ml-auto flex items-center gap-2')}
          disabled={isDisabled}
          size="sm"
          variant={variant}
        >
          <span className="max-md:hidden">{displayText}</span>
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {entities.map((entity) => {
          if (entity.type === 'member' && !isTeamOwner) {
            return null;
          }

          return (
            <DropdownMenuItem
              key={entity.type}
              onClick={() => openModal(entity.type)}
            >
              {t(getTranslationKey(entity.type))}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
