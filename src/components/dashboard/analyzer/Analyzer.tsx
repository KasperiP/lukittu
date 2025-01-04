'use client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { bytesToSize } from '@/lib/utils/number-helpers';
import { cn } from '@/lib/utils/tailwind-helpers';
import { TeamContext } from '@/providers/TeamProvider';
import {
  ClipboardList,
  FileCheck,
  FileIcon,
  FileSearch,
  ShieldCheck,
  UploadCloud,
  XCircle,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ProgressStages } from './ProgressStages';

const MAX_FILE_SIZE = 1024 * 1024 * 50; // 50 MB
const ALLOWED_FILE_TYPE = 'application/java-archive';

export default function Analyzer() {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);
  const [result, setResult] = useState<any | null>(null);
  const [hasError, setHasError] = useState(false);

  const selectedTeam = teamCtx.teams.find(
    (team) => team.id === teamCtx.selectedTeam,
  );

  const hasWatermarkingPermission =
    selectedTeam?.limits?.allowWatermarking ?? false;

  useEffect(() => {
    if (!teamCtx.selectedTeam) return;
    setFile(null);
    setResult(null);
    setAnalyzing(false);
    setCurrentStage(-1);
    setHasError(false);
  }, [teamCtx.selectedTeam]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0] as File | null;
    if (droppedFile) {
      await handleFile(droppedFile);
    }
  };

  const validateFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(
        t('validation.file_too_large', {
          size: bytesToSize(MAX_FILE_SIZE),
        }),
      );
      return false;
    }

    if (file.type !== ALLOWED_FILE_TYPE && !file.name.endsWith('.jar')) {
      toast.error(t('validation.invalid_file_type'));
      return false;
    }

    return true;
  };

  const handleFile = async (file: File) => {
    if (!validateFile(file)) return;
    setFile(file);
  };

  const handleFileSelect = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jar';
    input.multiple = false;
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await handleFile(file);
      }
    };
    input.click();
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setAnalyzing(false);
    setCurrentStage(-1);
    setHasError(false);
  };

  const analyzeFile = async (file: File) => {
    try {
      setAnalyzing(true);
      setResult(null);
      setHasError(false);
      setCurrentStage(0);

      await new Promise((resolve) => setTimeout(resolve, 500));
      setCurrentStage(1);

      const formData = new FormData();
      formData.append('file', file);

      await new Promise((resolve) => setTimeout(resolve, 300));
      setCurrentStage(2);

      const response = await fetch('/api/analyzer', {
        method: 'POST',
        body: formData,
      });

      setCurrentStage(3);
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (!response.ok) {
        const error = await response.json();
        setHasError(true);
        throw new Error(error.message || t('general.server_error'));
      }

      const analysisResult = await response.json();
      setResult(analysisResult);

      // Move to final stage immediately after getting results
      setCurrentStage(4);

      // Show toasts after setting the stage
      if (analysisResult.licenseKey) {
        toast.error(t('dashboard.analyzer.watermark_found'));
      } else if (analysisResult.timestamp) {
        toast.warning(t('dashboard.analyzer.timestamp_found'));
      } else {
        toast.success(t('dashboard.analyzer.no_watermark_found'));
      }
    } catch (error) {
      setHasError(true);
      toast.error((error as Error).message);
    } finally {
      // Small delay before completing
      await new Promise((resolve) => setTimeout(resolve, 300));
      setAnalyzing(false);
    }
  };

  const getResultType = () => {
    if (hasError) return 'error';
    if (!result) return null;

    const hasWatermark = Boolean(result.licenseKey);
    const hasTimestamp = Boolean(result.timestamp);

    if (hasWatermark && hasTimestamp) return 'success';
    if (hasWatermark || hasTimestamp) return 'warning';
    return 'error'; // No watermark and no timestamp
  };

  return (
    <Card className="overflow-hidden">
      <div className="border-b p-6">
        <h2 className="flex items-center text-xl font-semibold">
          {t('dashboard.analyzer.analyze_files')}
          {!hasWatermarkingPermission && (
            <Badge className="ml-2 text-xs" variant="primary">
              PRO
            </Badge>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.analyzer.description')}
        </p>
      </div>

      <div className={cn('relative grid grid-cols-1 gap-6 p-6 lg:grid-cols-2')}>
        {!hasWatermarkingPermission && (
          <div className="absolute inset-0 z-10 flex h-full w-full flex-col items-center justify-center bg-background/50 backdrop-blur-[1px]">
            <div className="px-4 text-center">
              <Badge className="mb-2" variant="primary">
                PRO
              </Badge>
              <p className="font-medium">
                {t('dashboard.analyzer.pro_feature')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.analyzer.upgrade_to_use')}
              </p>
            </div>
          </div>
        )}
        <div
          className={cn(
            'flex min-h-[455px] cursor-pointer flex-col rounded-xl border-2 border-dashed transition-colors',
            isDragging && 'border-primary bg-primary/5',
            file ? 'border-muted p-6' : 'p-8',
          )}
          onClick={handleFileSelect}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="flex h-full flex-col items-center justify-center">
            {!file ? (
              <div className="flex flex-col items-center gap-6 text-center">
                <div className="rounded-full bg-primary/10 p-8">
                  <UploadCloud className="h-12 w-12 text-primary" />
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-medium">
                    {t('dashboard.analyzer.drag_and_drop')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('dashboard.analyzer.file_size_limit', {
                      size: bytesToSize(MAX_FILE_SIZE),
                    })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="w-full space-y-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="absolute -inset-4 rounded-full bg-primary/5" />
                    <FileIcon className="h-16 w-16 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-medium">Ready to analyze</p>
                    <p className="text-sm text-muted-foreground">
                      Click the button below to start
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border bg-card/50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {bytesToSize(file.size)}
                      </p>
                    </div>
                    <button
                      className="rounded-full p-2 transition-colors hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReset();
                      }}
                    >
                      <XCircle className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <Button
                  className="w-full"
                  disabled={analyzing}
                  onClick={(e) => {
                    e.stopPropagation();
                    analyzeFile(file);
                  }}
                >
                  {t('dashboard.analyzer.analyze')}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <ProgressStages
            currentStage={currentStage}
            resultType={getResultType()}
            stages={[
              { label: t('dashboard.analyzer.preparing'), icon: ClipboardList },
              { label: t('dashboard.analyzer.scanning'), icon: FileSearch },
              { label: t('dashboard.analyzer.analyzing'), icon: Zap },
              { label: t('dashboard.analyzer.checking'), icon: ShieldCheck },
              { label: t('dashboard.analyzer.generating'), icon: FileCheck },
            ]}
          />

          {result && (
            <div className="mt-4">
              <h3 className="text-lg font-semibold">
                {t('dashboard.analyzer.results')}
              </h3>
              <pre className="mt-2 rounded-lg bg-muted p-4">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
