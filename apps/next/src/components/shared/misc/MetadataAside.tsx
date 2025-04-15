import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Metadata } from '@lukittu/prisma';
import { useTranslations } from 'next-intl';

interface MetadataAsideProps {
  metadata: Metadata[] | null;
}

export default function MetadataAside({ metadata }: MetadataAsideProps) {
  const t = useTranslations();

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b py-5">
          <CardTitle className="text-xl font-bold">
            {t('general.metadata')}
          </CardTitle>
        </CardHeader>
        <CardContent className="mt-4">
          <div className="flex flex-col gap-4">
            {metadata ? (
              metadata.length ? (
                metadata.map((item, index) => (
                  <div key={index} className="flex flex-col gap-2">
                    <h3 className="break-all text-sm font-semibold">
                      {item.key}
                    </h3>
                    <p className="break-all text-sm text-muted-foreground">
                      {item.value}
                    </p>
                  </div>
                ))
              ) : (
                <div className="flex h-24 flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
                  {t('general.no_metadata')}
                </div>
              )
            ) : (
              <Skeleton className="h-8 w-full" />
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
