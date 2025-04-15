import { useTranslations } from 'next-intl';
import { FilterChip } from '../FilterChip';
import { CustomersSearchFilter } from '../form/CustomersSearchFilter';

interface CustomerFilterChipProps {
  customerIds: string[];
  tempCustomerIds: string[];
  setCustomerIds: (ids: string[]) => void;
  setTempCustomerIds: (ids: string[]) => void;
}

export function CustomerFilterChip({
  customerIds,
  tempCustomerIds,
  setCustomerIds,
  setTempCustomerIds,
}: CustomerFilterChipProps) {
  const t = useTranslations();

  return (
    <FilterChip
      activeValue={
        customerIds.length > 0
          ? `${customerIds.length} ${t('general.selected')}`
          : t('general.customers')
      }
      isActive={customerIds.length > 0}
      label={t('general.customer')}
      popoverTitle={t('general.select_customers')}
      onApply={() => setCustomerIds(tempCustomerIds)}
      onClear={() => {
        setTempCustomerIds(customerIds);
      }}
      onReset={() => {
        setCustomerIds([]);
        setTempCustomerIds([]);
      }}
    >
      <CustomersSearchFilter
        value={tempCustomerIds}
        onChange={setTempCustomerIds}
      />
    </FilterChip>
  );
}
