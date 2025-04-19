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
  return (
    <TableBody>
      {[...Array(rows)].map((_, index) => (
        <TableRow key={index}>
          {[...Array(columns)].map((_, index) => (
            <TableCell key={index}>
              <Skeleton className={`h-${height} w-full`} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}
