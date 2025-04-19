import { cn } from '@/lib/utils/tailwind-helpers';

interface MapTooltipProps {
  name: string;
  value: string;
  label: string;
  x: number;
  y: number;
}

export const MapTooltip = ({ name, value, label, x, y }: MapTooltipProps) => (
  <div
    className={cn(
      'absolute',
      'z-50',
      'px-3',
      'py-1.5',
      'text-sm',
      'translate-x-2',
      'translate-y-2',
      'pointer-events-none',
      'rounded-md',
      'border',
      'text-muted-foreground',
      'bg-popover',
      'animate-in',
      'shadow-md',
    )}
    style={{
      left: x,
      top: y,
    }}
  >
    <div className="text-xs font-semibold text-foreground">{name}</div>
    <div className="text-xs">
      <strong className="text-primary">{value}</strong> {label}
    </div>
  </div>
);
