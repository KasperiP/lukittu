'use client';
import { VariantProps } from 'class-variance-authority';
import { Button, buttonVariants } from '../ui/button';
import { LoadingSpinner } from './LoadingSpinner';

interface LoadingButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  pending?: boolean;
  size?: VariantProps<typeof buttonVariants>['size'];
  variant?: VariantProps<typeof buttonVariants>['variant'];
}

export default function LoadingButton({
  children,
  pending = false,
  variant = 'default',
  disabled = false,
  size = 'sm',
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      disabled={pending || disabled}
      variant={variant}
      {...props}
      size={size}
    >
      {pending ? (
        <div className="relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <LoadingSpinner />
          </div>
          <div className="opacity-0">{children}</div>
        </div>
      ) : (
        children
      )}
    </Button>
  );
}
