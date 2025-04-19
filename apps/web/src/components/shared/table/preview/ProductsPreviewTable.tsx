import {
  ILicenseGetSuccessResponse,
  ILicensesUpdateResponse,
} from '@/app/api/(dashboard)/licenses/[slug]/route';
import {
  IProductsGetResponse,
  IProductsGetSuccessResponse,
} from '@/app/api/(dashboard)/products/route';
import { LicenseProductsModal } from '@/components/dashboard/licenses/view/LicenseProductsModal';
import { ProductsActionDropdown } from '@/components/dashboard/products/ProductsActionDropdown';
import { DateConverter } from '@/components/shared/DateConverter';
import TablePagination from '@/components/shared/table/TablePagination';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTableScroll } from '@/hooks/useTableScroll';
import { cn } from '@/lib/utils/tailwind-helpers';
import { SetLicenseScheama } from '@/lib/validation/licenses/set-license-schema';
import { ProductModalProvider } from '@/providers/ProductModalProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { ArrowDownUp, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR, { useSWRConfig } from 'swr';

interface ProductsPreviewTableProps {
  license: ILicenseGetSuccessResponse['license'] | undefined;
  licenseId: string;
}

const fetchProducts = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IProductsGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function ProductsPreviewTable({
  license,
  licenseId,
}: ProductsPreviewTableProps) {
  const t = useTranslations();
  const router = useRouter();
  const { showDropdown, containerRef } = useTableScroll();
  const teamCtx = useContext(TeamContext);
  const { mutate } = useSWRConfig();

  const [page, setPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<'name' | 'createdAt' | null>(
    null,
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
    null,
  );
  const [licenseProductsModalOpen, setLicenseProductsModalOpen] =
    useState(false);

  const searchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: '10',
    ...(sortColumn && { sortColumn }),
    ...(sortDirection && { sortDirection }),
    ...(licenseId && { licenseId }),
  });

  const { data, error, isLoading } = useSWR<IProductsGetSuccessResponse>(
    teamCtx.selectedTeam
      ? ['/api/products', teamCtx.selectedTeam, searchParams.toString()]
      : null,
    ([url, _, params]) => fetchProducts(`${url}?${params}`),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const handleLicenseEdit = async (payload: SetLicenseScheama) => {
    const response = await fetch(`/api/licenses/${licenseId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ILicensesUpdateResponse;

    return data;
  };

  const handleLicenseProductsSet = async (productIds: string[]) => {
    if (!license) {
      toast.error(t('general.error_occurred'));
      return;
    }
    const res = await handleLicenseEdit({
      customerIds: license.customers.map((c) => c.id),
      productIds,
      expirationDate: license.expirationDate,
      expirationDays: license.expirationDays,
      expirationStart:
        license.expirationType === 'DURATION' ? license.expirationStart : null,
      expirationType: license.expirationType,
      ipLimit: license.ipLimit,
      licenseKey: license.licenseKey,
      metadata: license.metadata as {
        key: string;
        value: string;
        locked: boolean;
      }[],
      seats: license.seats,
      sendEmailDelivery: false,
      suspended: license.suspended,
    });

    if ('message' in res) {
      toast.error(res.message || t('general.error_occurred'));
      return;
    }

    mutate((key) => Array.isArray(key) && key[0] === '/api/products');
    mutate((key) => Array.isArray(key) && key[0] === '/api/licenses');

    toast.success(t('dashboard.licenses.license_updated'));
  };

  const openModal = () => {
    setLicenseProductsModalOpen(true);
  };

  const products = data?.products ?? [];
  const totalProducts = data?.totalResults ?? 1;

  return (
    <ProductModalProvider>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b py-5">
          <CardTitle className="flex w-full items-center text-xl font-bold">
            {t('dashboard.navigation.products')}
            <div className="ml-auto flex gap-2">
              <Button
                className="ml-auto flex gap-2"
                size="sm"
                variant="outline"
                onClick={openModal}
              >
                <Plus className="h-4 w-4" />
                <span className={cn('max-md:hidden')}>
                  {t('dashboard.products.add_product')}
                </span>
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
          {totalProducts ? (
            <>
              <Table
                className="relative"
                containerRef={containerRef as React.RefObject<HTMLDivElement>}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead className="truncate">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSortColumn('name');
                          setSortDirection(
                            sortColumn === 'name' && sortDirection === 'asc'
                              ? 'desc'
                              : 'asc',
                          );
                        }}
                      >
                        {t('general.name')}
                        <ArrowDownUp className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="truncate">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSortColumn('createdAt');
                          setSortDirection(
                            sortColumn === 'createdAt' &&
                              sortDirection === 'asc'
                              ? 'desc'
                              : 'asc',
                          );
                        }}
                      >
                        {t('general.created_at')}
                        <ArrowDownUp className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead
                      className={cn(
                        'sticky right-0 w-[50px] truncate px-2 text-right',
                        {
                          'bg-background drop-shadow-md': showDropdown,
                        },
                      )}
                    />
                  </TableRow>
                </TableHeader>
                {isLoading ? (
                  <TableSkeleton columns={3} rows={3} />
                ) : (
                  <TableBody>
                    {products.map((product) => (
                      <TableRow
                        key={product.id}
                        className="cursor-pointer"
                        onClick={() =>
                          router.push(`/dashboard/products/${product.id}`)
                        }
                      >
                        <TableCell className="truncate">
                          {product.name}
                        </TableCell>
                        <TableCell className="truncate">
                          <DateConverter date={product.createdAt} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'sticky right-0 w-[50px] truncate px-2 py-0 text-right',
                            {
                              'bg-background drop-shadow-md': showDropdown,
                            },
                          )}
                        >
                          <ProductsActionDropdown
                            handleLicenseProductsSet={handleLicenseProductsSet}
                            license={license}
                            product={product}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                )}
              </Table>
              <TablePagination
                page={page}
                pageSize={10}
                setPage={setPage}
                totalItems={totalProducts}
                totalPages={Math.ceil(totalProducts / 10)}
              />
            </>
          ) : (
            <div className="flex h-24 flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
              {t('dashboard.licenses.no_products_assigned')}
            </div>
          )}
        </CardContent>
      </Card>
      <LicenseProductsModal
        license={license}
        open={licenseProductsModalOpen}
        selectedProducts={products}
        onOpenChange={setLicenseProductsModalOpen}
        onSubmit={handleLicenseProductsSet}
      />
    </ProductModalProvider>
  );
}
