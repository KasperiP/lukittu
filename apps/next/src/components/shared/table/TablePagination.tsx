import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  ArrowRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface TablePaginationProps {
  pageSize: number;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  totalItems: number;
  setPageSize?: React.Dispatch<React.SetStateAction<number>>;
}

export default function TablePagination({
  setPage,
  setPageSize,
  totalPages,
  page,
  totalItems,
  pageSize,
}: TablePaginationProps) {
  const t = useTranslations();

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newPageSize: string) => {
    setPageSize?.(parseInt(newPageSize));
  };

  return (
    <>
      <div className="mt-4 flex flex-col items-center justify-between gap-2 max-md:hidden lg:flex-row">
        <div className="flex items-center gap-4">
          <p className="text-sm font-medium">
            {t('general.showing_of_results', {
              start: (page - 1) * pageSize + 1,
              end: Math.min(page * pageSize, totalItems),
              total: totalItems,
            })}
          </p>
        </div>
        <div className="flex items-center justify-end gap-4">
          {setPageSize && (
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">
                {t('general.rows_per_page')}:
              </p>
              <Select
                value={pageSize.toString()}
                onValueChange={handlePageSizeChange}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <p className="text-sm font-medium">
              {t('general.page_of', {
                page,
                pages: totalPages,
              })}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              className="hidden h-8 w-8 p-0 lg:flex"
              disabled={page === 1}
              variant="outline"
              onClick={() => handlePageChange(1)}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              className="h-8 w-8 p-0"
              disabled={page === 1}
              variant="outline"
              onClick={() => handlePageChange(page - 1)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              className="h-8 w-8 p-0"
              disabled={page === totalPages}
              variant="outline"
              onClick={() => handlePageChange(page + 1)}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              className="hidden h-8 w-8 p-0 lg:flex"
              disabled={page === totalPages}
              variant="outline"
              onClick={() => handlePageChange(totalPages)}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between p-2 pb-0 pt-4 text-sm md:hidden">
        <div className="flex items-center space-x-2">
          <span>
            {(page - 1) * pageSize + 1} -{' '}
            {Math.min(page * pageSize, totalItems)} / {totalItems}
          </span>
          {setPageSize && (
            <Select
              value={pageSize.toString()}
              onValueChange={handlePageSizeChange}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center space-x-1">
          <span className="mr-2">
            {page} / {totalPages}
          </span>
          <Button
            className="h-8 w-8"
            disabled={page === 1}
            size="icon"
            variant="outline"
            onClick={() => handlePageChange(page - 1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            className="h-8 w-8"
            disabled={page === totalPages}
            size="icon"
            variant="outline"
            onClick={() => handlePageChange(page + 1)}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}
