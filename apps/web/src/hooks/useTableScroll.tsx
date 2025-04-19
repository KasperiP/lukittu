import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const useTableScroll = (buffer: number = 20) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;

      const hasScrolledOutRight =
        scrollLeft + clientWidth + buffer < scrollWidth;
      setShowDropdown(hasScrolledOutRight);
    }
  }, [buffer]);

  const observer = useMemo(
    () =>
      new ResizeObserver(() => {
        handleScroll();
      }),
    [handleScroll],
  );

  const handleResize = useCallback(() => {
    handleScroll();
  }, [handleScroll]);

  useEffect(() => {
    const tableContainer = containerRef.current;

    if (tableContainer) {
      observer.observe(tableContainer);
      const onScroll = () => requestAnimationFrame(handleScroll);
      tableContainer.addEventListener('scroll', onScroll);
      window.addEventListener('resize', handleResize);

      handleScroll();

      return () => {
        tableContainer.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', handleResize);
        observer.disconnect();
      };
    }
  }, [handleScroll, handleResize, observer, containerRef.current?.nodeValue]);

  return { showDropdown, containerRef };
};
