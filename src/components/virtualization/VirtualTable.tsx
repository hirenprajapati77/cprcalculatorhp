import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualTableProps<T> {
  data: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  header: React.ReactNode;
  className?: string;
}

export function VirtualTable<T>({ data, rowHeight, renderRow, header, className = '' }: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10, // Render 10 items outside of the visible area
  });

  return (
    <div
      ref={parentRef}
      className={`overflow-auto w-full max-h-[800px] border border-border-primary rounded-lg ${className}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="w-full relative bg-bg-primary">
        <div className="sticky top-0 z-20 bg-bg-secondary border-b border-border-primary shadow-sm">
          {header}
        </div>
        <div
          className="w-full relative"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = data[virtualRow.index];
            return (
              <div
                key={virtualRow.index}
                className="absolute top-0 left-0 w-full"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {renderRow(item, virtualRow.index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
