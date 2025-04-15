import { IProductGetSuccessResponse } from '@/app/api/(dashboard)/products/[slug]/route';
import { DateConverter } from '@/components/shared/DateConverter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Copy, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

interface ProductDetailsProps {
  product: IProductGetSuccessResponse['product'] | null;
}

export function ProductDetails({ product }: ProductDetailsProps) {
  const [showMore, setShowMore] = useState(false);
  const t = useTranslations();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b py-5">
        <CardTitle className="flex items-center text-xl font-bold">
          {t('general.details')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">ID</h3>
            <div className="text-sm font-semibold">
              {product ? (
                <span className="flex items-center gap-2">
                  <Copy className="h-4 w-4 shrink-0" />
                  <TooltipProvider>
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <span
                          className="truncate text-primary hover:underline"
                          role="button"
                          onClick={() => {
                            navigator.clipboard.writeText(product.id);
                            toast.success(t('general.copied_to_clipboard'));
                          }}
                        >
                          {product.id}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('general.click_to_copy')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
              ) : (
                <Skeleton className="h-4 w-full" />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">URL</h3>
            <div className="text-sm text-muted-foreground">
              {product ? (
                product.url ? (
                  <Link
                    className="block truncate text-primary hover:underline"
                    href={product.url}
                  >
                    {product.url}
                  </Link>
                ) : (
                  t('general.unknown')
                )
              ) : (
                <Skeleton className="h-4 w-full" />
              )}
            </div>
          </div>
          {showMore && (
            <>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {t('general.created_at')}
                </h3>
                <div className="text-sm text-muted-foreground">
                  {product ? (
                    <DateConverter date={product.createdAt} />
                  ) : (
                    <Skeleton className="h-4 w-full" />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {t('general.updated_at')}
                </h3>
                <div className="text-sm text-muted-foreground">
                  {product ? (
                    <DateConverter date={product.updatedAt} />
                  ) : (
                    <Skeleton className="h-4 w-full" />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {t('general.created_by')}
                </h3>
                <div className="text-sm font-semibold">
                  {product ? (
                    product.createdBy ? (
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4 shrink-0" />
                        <Link
                          className="text-primary hover:underline"
                          href={`/dashboard/users/${product.createdBy.id}`}
                        >
                          {product.createdBy.fullName}
                        </Link>
                      </span>
                    ) : (
                      t('general.unknown')
                    )
                  ) : (
                    <Skeleton className="h-4 w-full" />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <Button
          className="mt-2 px-0"
          size="sm"
          variant="link"
          onClick={() => setShowMore(!showMore)}
        >
          {showMore ? t('general.show_less') : t('general.show_more')}
        </Button>
      </CardContent>
    </Card>
  );
}
