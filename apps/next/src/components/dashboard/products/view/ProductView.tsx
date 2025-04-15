'use client';
import {
  IProductGetResponse,
  IProductGetSuccessResponse,
} from '@/app/api/(dashboard)/products/[slug]/route';
import MetadataAside from '@/components/shared/misc/MetadataAside';
import LicensesPreviewTable from '@/components/shared/table/preview/LicensesPreviewTable';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductModalProvider } from '@/providers/ProductModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useContext, useEffect } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { ReleasesTable } from '../../releases/list/ReleasesTable';
import { ProductsActionDropdown } from '../ProductsActionDropdown';
import { ProductDetails } from './ProductDetails';

const fetchProduct = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IProductGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function ProductView() {
  const params = useParams();
  const t = useTranslations();
  const router = useRouter();
  const teamCtx = useContext(TeamContext);
  const productId = params.slug as string;

  const { data, error, isLoading } = useSWR<IProductGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/products', productId, teamCtx.selectedTeam]
      : null,
    ([url, productId]) => fetchProduct(`${url}/${productId}`),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
      router.push('/dashboard/products');
    }
  }, [error, router, t]);

  const product = data?.product;

  return (
    <ProductModalProvider>
      <div className="flex items-center justify-between gap-2">
        {isLoading ? (
          <Skeleton className="h-8 w-96" />
        ) : (
          <h1 className="truncate text-2xl font-bold">{product?.name}</h1>
        )}
        <ProductsActionDropdown product={product!} variant="outline" />
      </div>
      <Separator className="mt-2" />
      <div className="mt-6">
        <div className="flex">
          <div className="flex w-full gap-4 max-xl:flex-col-reverse">
            <div className="flex w-full max-w-full flex-col gap-4 overflow-auto">
              <LicensesPreviewTable productId={productId} />
              <ReleasesTable productId={productId} />
            </div>
            <aside className="flex w-full max-w-96 flex-shrink-0 flex-col gap-4 max-xl:max-w-full">
              <ProductDetails product={product ?? null} />
              <MetadataAside metadata={product?.metadata ?? null} />
            </aside>
          </div>
        </div>
      </div>
    </ProductModalProvider>
  );
}
