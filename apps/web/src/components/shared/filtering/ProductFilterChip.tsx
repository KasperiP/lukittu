import { useTranslations } from 'next-intl';
import { FilterChip } from '../FilterChip';
import { ProductsSearchFilter } from '../form/ProductsSearchFilter';

interface ProductFilterChipProps {
  productIds: string[];
  tempProductIds: string[];
  setProductIds: (ids: string[]) => void;
  setTempProductIds: (ids: string[]) => void;
}

export function ProductFilterChip({
  productIds,
  tempProductIds,
  setProductIds,
  setTempProductIds,
}: ProductFilterChipProps) {
  const t = useTranslations();

  return (
    <FilterChip
      activeValue={
        productIds.length > 0
          ? `${productIds.length} ${t('general.selected')}`
          : t('general.products')
      }
      isActive={productIds.length > 0}
      label={t('general.product')}
      popoverTitle={t('general.select_products')}
      onApply={() => setProductIds(tempProductIds)}
      onClear={() => {
        setTempProductIds(productIds);
      }}
      onReset={() => {
        setProductIds([]);
        setTempProductIds([]);
      }}
    >
      <ProductsSearchFilter
        value={tempProductIds}
        onChange={setTempProductIds}
      />
    </FilterChip>
  );
}
