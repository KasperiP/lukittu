import { Skeleton } from '@/components/ui/skeleton';
import { TableBody, TableCell, TableRow } from '@/components/ui/table';

interface TableSkeletonProps {
  rows: number;
  columns: number;
  height?: number;
}

export default function TableSkeleton({
  rows,
  columns,
  height = 5,
}: TableSkeletonProps) {
  const getHeightClass = () => {
    switch (height) {
      case 3:
        return 'h-3';
      case 4:
        return 'h-4';
      case 5:
        return 'h-5';
      case 6:
        return 'h-6';
      default:
        return 'h-4';
    }
  };

  return (
    <TableBody>
      {[...Array(rows)].map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {[...Array(columns)].map((_, colIndex) => (
            <TableCell key={colIndex}>
              <Skeleton className={`${getHeightClass()} w-full`} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}
