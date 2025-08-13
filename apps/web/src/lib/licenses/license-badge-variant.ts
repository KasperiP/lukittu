import { badgeVariants } from '@/components/ui/badge';
import { LicenseStatus } from '@lukittu/shared';
import { VariantProps } from 'class-variance-authority';

type Variant = VariantProps<typeof badgeVariants>['variant'];

export const getLicenseStatusBadgeVariant = (
  status: LicenseStatus,
): Variant => {
  switch (status) {
    case LicenseStatus.ACTIVE:
      return 'success';
    case LicenseStatus.INACTIVE:
      return 'secondary';
    case LicenseStatus.EXPIRING:
      return 'warning';
    case LicenseStatus.EXPIRED:
      return 'error';
    case LicenseStatus.SUSPENDED:
      return 'error';
  }
};
