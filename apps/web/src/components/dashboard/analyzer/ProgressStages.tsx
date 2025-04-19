'use client';
import { cn } from '@/lib/utils/tailwind-helpers';
import { LucideIcon } from 'lucide-react';

interface StageProps {
  label: string;
  icon: LucideIcon;
}

interface ProgressStagesProps {
  stages: StageProps[];
  currentStage: number;
  resultType?: 'success' | 'warning' | 'error' | null;
}

export function ProgressStages({
  stages,
  currentStage,
  resultType,
}: ProgressStagesProps) {
  return (
    <div className="space-y-4">
      {stages.map((stage, index) => {
        const isActive = currentStage === index;
        const isComplete = currentStage > index;
        const isUpcoming = currentStage < index;
        const isCheckingStage = index === 3; // ShieldCheck stage
        const isFinalStage = index === stages.length - 1;

        const Icon = stage.icon;

        const getStateColors = () => {
          if (isUpcoming) return 'opacity-50';
          if (isActive && !isFinalStage) return 'border-primary bg-primary/5';
          if ((isComplete || isActive) && isCheckingStage) {
            switch (resultType) {
              case 'error':
                return 'border-destructive bg-destructive/5';
              case 'warning':
                return 'border-yellow-500 bg-yellow-500/5';
              case 'success':
                return 'border-green-500 bg-green-500/5';
              default:
                return 'border-green-500 bg-green-500/5';
            }
          }
          if (isComplete || (isActive && isFinalStage))
            return 'border-green-500 bg-green-500/5';
          return '';
        };

        const getIconColors = () => {
          if (isUpcoming) return 'text-muted-foreground';
          if (isActive && !isFinalStage) return 'text-primary';
          if ((isComplete || isActive) && isCheckingStage) {
            switch (resultType) {
              case 'error':
                return 'text-destructive';
              case 'warning':
                return 'text-yellow-500';
              case 'success':
                return 'text-green-500';
              default:
                return 'text-green-500';
            }
          }
          if (isComplete || (isActive && isFinalStage)) return 'text-green-500';
          return '';
        };

        const getBackgroundColors = () => {
          if (isUpcoming) return 'bg-muted';
          if (isActive && !isFinalStage) return 'animate-bounce bg-primary/10';
          if ((isComplete || isActive) && isCheckingStage) {
            switch (resultType) {
              case 'error':
                return 'bg-destructive/10';
              case 'warning':
                return 'bg-yellow-500/10';
              case 'success':
                return 'bg-green-500/10';
              default:
                return 'bg-green-500/10';
            }
          }
          if (isComplete || (isActive && isFinalStage))
            return 'bg-green-500/10';
          return '';
        };

        const getStatusText = () => {
          const isFinalStage = index === stages.length - 1;

          if (isUpcoming) return 'Waiting...';
          if (isActive && !isFinalStage) return 'Processing...';
          if (isComplete || (isActive && isFinalStage)) return 'Complete';
          return '';
        };

        return (
          <div
            key={stage.label}
            className={cn(
              'flex items-center gap-4 rounded-lg border p-4 transition-all duration-300',
              getStateColors(),
            )}
          >
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                getBackgroundColors(),
              )}
            >
              <Icon className={cn('h-5 w-5', getIconColors())} />
            </div>
            <div>
              <p className="font-medium">{stage.label}</p>
              <p className="text-sm text-muted-foreground">{getStatusText()}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
