'use client';
import { ConfettiContext } from '@/providers/ThemeProvider';
import { useContext } from 'react';
import { Button } from '../ui/button';
import { LoadingSpinner } from './LoadingSpinner';

interface ConfettiButtonProps {
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
}

export default function ConfettiButton({
  className,
  children,
  disabled,
  onClick,
  loading,
}: ConfettiButtonProps) {
  const ctx = useContext(ConfettiContext);
  return (
    <>
      <Button
        className={className}
        disabled={ctx.isConfettiActive || disabled}
        size="sm"
        variant="default"
        onClick={() => {
          ctx.setIsConfettiActive(true);

          setTimeout(() => {
            ctx.setIsConfettiActive(false);
          }, 1500);

          if (onClick) {
            onClick();
          }
        }}
      >
        {ctx.isConfettiActive || loading ? (
          <LoadingSpinner size={24} />
        ) : (
          children
        )}
      </Button>
    </>
  );
}
