import { badgeVariants } from '@/components/ui/badge';
import { VariantProps } from 'class-variance-authority';

export type LicenseStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'SUSPENDED';

type Variant = VariantProps<typeof badgeVariants>['variant'];

export const getLicenseStatusBadgeVariant = (
  status: LicenseStatus,
): Variant => {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'INACTIVE':
      return 'secondary';
    case 'EXPIRING':
      return 'warning';
    case 'EXPIRED':
      return 'error';
    case 'SUSPENDED':
      return 'error';
  }
};
