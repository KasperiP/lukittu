'use client';
import LoadingButton from '@/components/shared/LoadingButton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { bytesToSize } from '@/lib/utils/number-helpers';
import { cn } from '@/lib/utils/tailwind-helpers';
import {
  AlertCircle,
  CheckCircle2,
  FileIcon,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

const MAX_FILE_SIZE = 1024 * 1024 * 50; // 50 MB

interface AnalysisResult {
  licenseKey: string | null;
  timestamp: number | null;
}

export default function Analyzer() {
  const t = useTranslations();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState(0);

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

  const analyzeFile = async (file: File) => {
    try {
      setAnalyzing(true);
      setResult(null);
      setProgress(20);

      // Add minimal delay for UX
      await new Promise((resolve) => setTimeout(resolve, 500));

      const formData = new FormData();
      formData.append('file', file);

      setProgress(40);
      await new Promise((resolve) => setTimeout(resolve, 300));

      const response = await fetch('/api/analyzer', {
        method: 'POST',
        body: formData,
      });

      setProgress(80);
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t('general.server_error'));
      }

      const analysisResult = await response.json();
      setProgress(100);
      setResult(analysisResult);

      // Show appropriate toast based on results
      if (analysisResult.licenseKey) {
        toast.error(t('dashboard.analyzer.watermark_found'));
      } else if (analysisResult.timestamp) {
        toast.warning(t('dashboard.analyzer.timestamp_found'));
      } else {
        toast.success(t('dashboard.analyzer.no_watermark_found'));
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      // Keep progress visible briefly before resetting
      await new Promise((resolve) => setTimeout(resolve, 500));
      setAnalyzing(false);
      setProgress(0);
    }
  };

  const handleFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      return toast.error(
        t('validation.file_too_large', {
          size: bytesToSize(MAX_FILE_SIZE),
        }),
      );
    }
    setFile(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      await handleFile(droppedFile);
    }
  };

  const handleFileSelect = async () => {
    const input = document.createElement('input');
    input.type = 'file';
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
  };

  const renderResults = () => {
    if (!result) return null;

    const date = result.timestamp ? new Date(result.timestamp) : null;
    const hasFindings = result.licenseKey || result.timestamp;

    return (
      <Alert className="mt-4" variant={hasFindings ? 'default' : 'default'}>
        {hasFindings ? (
          <AlertCircle className="h-5 w-5" />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        )}
        <AlertTitle>
          {result.licenseKey
            ? t('dashboard.analyzer.watermark_found')
            : result.timestamp
              ? t('dashboard.analyzer.timestamp_found')
              : t('dashboard.analyzer.no_watermark_found')}
        </AlertTitle>
        {hasFindings && (
          <AlertDescription className="mt-2 space-y-2">
            {result.licenseKey && (
              <div>
                <span className="font-semibold">{t('general.license')}: </span>
                <span className="font-mono">{result.licenseKey}</span>
              </div>
            )}
            {date && (
              <div>
                <span className="font-semibold">
                  {t('dashboard.analyzer.embedded_at')}:{' '}
                </span>
                <span>
                  {date.toLocaleDateString()} {date.toLocaleTimeString()}
                </span>
              </div>
            )}
          </AlertDescription>
        )}
      </Alert>
    );
  };

  return (
    <Card className="p-6">
      <div className="mb-4 space-y-2">
        <h2 className="text-lg font-semibold">
          {t('dashboard.analyzer.analyze_files')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.analyzer.description')}
        </p>
      </div>

      {!file ? (
        <div
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-12 text-center transition-all duration-200',
            isDragging &&
              'scale-[1.01] border-solid border-primary bg-primary/5',
          )}
          onClick={handleFileSelect}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div
            className={cn(
              'rounded-full bg-muted p-4 transition-transform duration-200',
              isDragging && 'scale-110',
            )}
          >
            <UploadCloud className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {isDragging
                ? t('dashboard.analyzer.drop_here')
                : t('dashboard.analyzer.drag_and_drop')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.analyzer.file_size_limit', {
                size: bytesToSize(MAX_FILE_SIZE),
              })}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="shrink-0 rounded-md bg-muted p-2">
                <FileIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {bytesToSize(file.size)}
                </p>
              </div>
            </div>
            <Button
              className="shrink-0"
              size="icon"
              variant="ghost"
              onClick={handleReset}
            >
              <XCircle className="h-5 w-5" />
            </Button>
          </div>

          {analyzing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t('dashboard.analyzer.analyzing')}
                </span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          <LoadingButton
            className="w-full"
            pending={analyzing}
            onClick={() => analyzeFile(file)}
          >
            {t('dashboard.analyzer.analyze')}
          </LoadingButton>

          {renderResults()}
        </div>
      )}
    </Card>
  );
}
