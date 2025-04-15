import {
  IProductsGetResponse,
  IProductsGetSuccessResponse,
} from '@/app/api/(dashboard)/products/route';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/tailwind-helpers';
import { TeamContext } from '@/providers/TeamProvider';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSWRInfinite from 'swr/infinite';

interface ProductsSearchFilterProps {
  value: string[];
  onChange: (value: string[]) => void;
}

const PAGE_SIZE = 25;

const fetchProducts = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IProductsGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export const ProductsSearchFilter = ({
  value,
  onChange,
}: ProductsSearchFilterProps) => {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const getKey = (
    pageIndex: number,
    previousPageData: IProductsGetResponse | null,
  ) => {
    if (!teamCtx.selectedTeam) return null;
    if (previousPageData && !previousPageData.products.length) return null;

    const searchParams = new URLSearchParams({
      pageSize: String(PAGE_SIZE),
      page: String(pageIndex + 1),
      search: debouncedSearchQuery,
    });

    return ['/api/products', teamCtx.selectedTeam, searchParams.toString()];
  };

  const { data, isLoading, size, setSize, isValidating } =
    useSWRInfinite<IProductsGetSuccessResponse>(
      getKey,
      ([url, _, params]) => fetchProducts(`${url}?${params}`),
      {
        revalidateAll: false,
        revalidateOnFocus: false,
        revalidateFirstPage: false,
      },
    );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const products = useMemo(() => {
    if (!data || 'message' in data) return [];
    return data.flatMap((page) =>
      page.products.map((product) => ({
        name: product.name,
        id: product.id,
      })),
    );
  }, [data]);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [searchQuery, products],
  );

  const handleSelect = useCallback(
    (productId: string) => {
      const newValue = value.includes(productId)
        ? value.filter((id) => id !== productId)
        : [...value, productId];
      onChange(newValue);
    },
    [value, onChange],
  );

  const handleReset = () => {
    setSearchQuery('');
    onChange([]);
  };

  const hasMore = useMemo(() => {
    if (!data || data.length === 0) return false;
    const lastPage = data[data.length - 1];
    return lastPage.products.length === PAGE_SIZE;
  }, [data]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isValidating && hasMore) {
          void setSize(size + 1);
        }
      },
      {
        root: container,
        threshold: 0.1,
        rootMargin: '150px 0px',
      },
    );

    const sentinel = container.querySelector('[data-sentinel]');
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => observer.disconnect();
  }, [size, setSize, isValidating, hasMore]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Input
          placeholder={t('dashboard.licenses.search_product')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {value.length > 0 && (
          <Button
            className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
            size="sm"
            variant="ghost"
            onClick={handleReset}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div
        ref={scrollContainerRef}
        className="max-h-[300px] space-y-2 overflow-y-auto"
      >
        {filteredProducts.length === 0 && !isLoading ? (
          <p className="text-center text-sm text-muted-foreground">
            {t('general.no_results')}
          </p>
        ) : (
          <>
            {filteredProducts.map((product) => (
              <div key={product.id} className="flex items-center space-x-2">
                <Checkbox
                  checked={value.includes(product.id)}
                  id={product.id}
                  onCheckedChange={() => handleSelect(product.id)}
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label
                        className="flex-1 truncate text-sm font-medium"
                        htmlFor={product.id}
                      >
                        {product.name}
                      </label>
                    </TooltipTrigger>
                    <TooltipContent>{product.name}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Check
                  className={cn(
                    'h-4 w-4',
                    value.includes(product.id) ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </div>
            ))}
            {(isLoading || isValidating) && (
              <div className="flex justify-center py-2">
                <LoadingSpinner />
              </div>
            )}
            <div className="h-0" data-sentinel />
          </>
        )}
      </div>
    </div>
  );
};
