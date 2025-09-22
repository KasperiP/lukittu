import { cn } from '@/lib/utils/tailwind-helpers';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { getImageProps } from 'next/image';
import * as React from 'react';

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full',
      className,
    )}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

function AvatarImage(
  props: React.ComponentProps<typeof AvatarPrimitive.Image>,
) {
  const { src, alt, width, height, ...rest } = props;

  if (!src) {
    // fallback to the original behavior
    return <AvatarPrimitive.Image {...props} />;
  }

  const size =
    width && height
      ? { width: Number(width), height: Number(height) }
      : { fill: true };

  // This is the key line that makes Next.js image optimization take effect
  // Ensure src is only string or StaticImport, not Blob
  const safeSrc = typeof src === 'string' ? src : undefined;
  const { props: nextOptimizedProps } = getImageProps({
    src: safeSrc as string,
    alt: String(alt),
    ...size,
    ...rest,
  });

  return <AvatarPrimitive.Image {...nextOptimizedProps} />;
}
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-muted',
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarFallback, AvatarImage };
