import {
  ICustomersGetResponse,
  ICustomersGetSuccessResponse,
} from '@/app/api/(dashboard)/customers/route';
import { MultiSelect } from '@/components/ui/multi-select';
import { TeamContext } from '@/providers/TeamProvider';
import { Customer } from '@lukittu/prisma';
import { useTranslations } from 'next-intl';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

const fetchCustomers = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ICustomersGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

interface CustomersMultiselectProps {
  onChange: (customerIds: string[], isClear?: boolean) => void;
  value?: string[];
  selectedCustomers?: Customer[];
}

export const CustomersMultiselect = ({
  onChange,
  value = [],
  selectedCustomers,
}: CustomersMultiselectProps) => {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [allCustomers, setAllCustomers] = useState<
    ICustomersGetSuccessResponse['customers']
  >([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading, error } = useSWR<ICustomersGetResponse>(
    teamCtx.selectedTeam
      ? ['/api/customers', teamCtx.selectedTeam, debouncedSearchQuery, page]
      : null,
    ([url]) =>
      fetchCustomers(
        `${url}?pageSize=${pageSize}${
          debouncedSearchQuery ? `&search=${debouncedSearchQuery}` : ''
        }&page=${page}`,
      ),
  );

  useEffect(() => {
    setAllCustomers([]);
    setPage(1);
  }, [debouncedSearchQuery]);

  useEffect(() => {
    if (!data || 'message' in data) {
      if (data && 'message' in data) {
        toast.error(data.message || t('general.server_error'));
      }
      return;
    }

    setAllCustomers((prev) => {
      const newCustomers = [...prev];
      data.customers.forEach((customer) => {
        if (!newCustomers.find((c) => c.id === customer.id)) {
          newCustomers.push(customer);
        }
      });
      return newCustomers;
    });
  }, [data, t]);

  const defaultOptions = useMemo(
    () =>
      selectedCustomers?.map((customer) => ({
        label: customer.email,
        value: customer.id,
      })) ?? [],
    [selectedCustomers],
  );

  const options = useMemo(
    () =>
      allCustomers.map((customer) => ({
        label: customer.email,
        value: customer.id,
      })),
    [allCustomers],
  );

  const handleLoadMore = useCallback(() => {
    if (data?.customers.length === pageSize) {
      setPage((prev) => prev + 1);
    }
  }, [data, pageSize]);

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

  if (error) {
    toast.error(error.message ?? t('general.server_error'));
  }

  return (
    <MultiSelect
      className="bg-background"
      defaultOptions={defaultOptions}
      hasMore={data?.customers.length === pageSize}
      loading={isLoading}
      options={options}
      placeholder={t('general.select_customers')}
      searchValue={searchQuery}
      value={value}
      onLoadMore={handleLoadMore}
      onSearch={setSearchQuery}
      onValueChange={handleValueChange}
    />
  );
};
