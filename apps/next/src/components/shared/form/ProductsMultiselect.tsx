import {
  IProductsGetResponse,
  IProductsGetSuccessResponse,
} from '@/app/api/(dashboard)/products/route';
import { MultiSelect } from '@/components/ui/multi-select';
import { TeamContext } from '@/providers/TeamProvider';
import { Product } from '@lukittu/prisma';
import { useTranslations } from 'next-intl';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

const fetchProducts = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IProductsGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

interface ProductsMultiselectProps {
  onChange: (productIds: string[], isClear?: boolean) => void;
  value?: string[];
  selectedProducts: Product[] | undefined;
}

export const ProductsMultiselect = ({
  onChange,
  value = [],
  selectedProducts,
}: ProductsMultiselectProps) => {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [allProducts, setAllProducts] = useState<
    IProductsGetSuccessResponse['products']
  >([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading, error } = useSWR<IProductsGetResponse>(
    teamCtx.selectedTeam
      ? ['/api/products', teamCtx.selectedTeam, debouncedSearchQuery, page]
      : null,
    ([url]) =>
      fetchProducts(
        `${url}?pageSize=${pageSize}&page=${page}${
          debouncedSearchQuery ? `&search=${debouncedSearchQuery}` : ''
        }`,
      ),
  );

  const defaultOptions = useMemo(
    () =>
      selectedProducts?.map((product) => ({
        label: product.name,
        value: product.id,
      })) ?? [],
    [selectedProducts],
  );

  useEffect(() => {
    setAllProducts([]);
    setPage(1);
  }, [debouncedSearchQuery]);

  useEffect(() => {
    if (!data || 'message' in data) {
      if (data && 'message' in data) {
        toast.error(data.message || t('general.server_error'));
      }
      return;
    }

    setAllProducts((prev) => {
      const newProducts = [...prev];
      data.products.forEach((product) => {
        if (!newProducts.find((p) => p.id === product.id)) {
          newProducts.push(product);
        }
      });
      return newProducts;
    });
  }, [data, t]);

  const options = useMemo(
    () =>
      allProducts.map((product) => ({
        label: product.name,
        value: product.id,
      })),
    [allProducts],
  );

  const handleValueChange = (newValue: string[], isClear?: boolean) => {
    if (isClear) {
      onChange([], true);
      return;
    }

    const removedId = value.find((id) => !newValue.includes(id));
    if (removedId && newValue.length < value.length) {
      onChange(newValue);
    } else {
      onChange(newValue);
    }
  };

  const handleLoadMore = useCallback(() => {
    if (data && data.products.length === pageSize) {
      setPage((prev) => prev + 1);
    }
  }, [data, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearchQuery]);

  if (error) {
    toast.error(error.message ?? t('general.server_error'));
  }

  return (
    <MultiSelect
      className="bg-background"
      defaultOptions={defaultOptions}
      hasMore={data?.products.length === pageSize}
      loading={isLoading}
      options={options}
      placeholder={t('general.select_products')}
      searchValue={searchQuery}
      value={value}
      onLoadMore={handleLoadMore}
      onSearch={setSearchQuery}
      onValueChange={handleValueChange}
    />
  );
};
