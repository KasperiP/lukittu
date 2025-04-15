import {
  ICustomersGetResponse,
  ICustomersGetSuccessResponse,
} from '@/app/api/(dashboard)/customers/route';
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

interface CustomersSearchFilterProps {
  value: string[];
  onChange: (value: string[]) => void;
}

const PAGE_SIZE = 25;

const fetchCustomers = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ICustomersGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export const CustomersSearchFilter = ({
  value,
  onChange,
}: CustomersSearchFilterProps) => {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const getKey = (
    pageIndex: number,
    previousPageData: ICustomersGetResponse | null,
  ) => {
    if (!teamCtx.selectedTeam) return null;
    if (previousPageData && !previousPageData.customers.length) return null;

    const searchParams = new URLSearchParams({
      pageSize: String(PAGE_SIZE),
      page: String(pageIndex + 1),
      search: debouncedSearchQuery,
    });

    return ['/api/customers', teamCtx.selectedTeam, searchParams.toString()];
  };

  const { data, isLoading, size, setSize, isValidating } =
    useSWRInfinite<ICustomersGetSuccessResponse>(
      getKey,
      ([url, _, params]) => fetchCustomers(`${url}?${params}`),
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

  const customers = useMemo(() => {
    if (!data || 'message' in data[0]) return [];
    return data.flatMap((page) =>
      page.customers.map((customer) => ({
        id: customer.id,
        fullName: customer.fullName,
        email: customer.email,
      })),
    );
  }, [data]);

  const filteredCustomers = useMemo(
    () =>
      customers.filter(
        (customer) =>
          customer.fullName
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          customer.email.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [searchQuery, customers],
  );

  const hasMore = useMemo(() => {
    if (!data || data.length === 0) return false;
    const lastPage = data[data.length - 1];
    return lastPage.customers.length === PAGE_SIZE;
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

  const handleSelect = useCallback(
    (customerId: string) => {
      const newValue = value.includes(customerId)
        ? value.filter((id) => id !== customerId)
        : [...value, customerId];
      onChange(newValue);
    },
    [value, onChange],
  );

  const handleReset = () => {
    setSearchQuery('');
    onChange([]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Input
          placeholder={t('general.search_customer')}
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
        {filteredCustomers.length === 0 && !isLoading ? (
          <p className="text-center text-sm text-muted-foreground">
            {t('general.no_results')}
          </p>
        ) : (
          <>
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                className="grid grid-cols-[auto_1fr_auto] items-start gap-x-2 pr-2"
              >
                <Checkbox
                  checked={value.includes(customer.id)}
                  className="mt-1"
                  id={customer.id}
                  onCheckedChange={() => handleSelect(customer.id)}
                />
                <div className="grid">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="truncate text-sm font-medium">
                          {customer.fullName ?? 'N/A'}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {customer.fullName ?? 'N/A'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="truncate text-sm text-muted-foreground">
                          {customer.email}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{customer.email}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Check
                  className={cn(
                    'mt-1 h-4 w-4',
                    value.includes(customer.id) ? 'opacity-100' : 'opacity-0',
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
