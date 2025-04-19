import { cn } from '@/lib/utils/tailwind-helpers';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        primary:
          'border-transparent bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
        secondary:
          'border-transparent bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
        outline: 'text-foreground',
        success:
          'border-transparent bg-[#d7f7c2] dark:bg-green-500/20 text-[#237f26] dark:text-green-400',
        error:
          'border-transparent bg-red-500/10 dark:bg-red-500/20 text-red-500 dark:text-red-400',
        warning:
          'border-transparent bg-yellow-500/10 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  showIcon?: boolean;
}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {props.children}
    </div>
  );
}

export { Badge, badgeVariants };
