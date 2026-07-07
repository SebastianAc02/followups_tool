'use client';

import { cn } from './cn';
import { tabButton } from './tabs.variants.ts';
import { Dot } from './Dot';

export type TabTone = 'overdue' | 'today' | 'done' | 'faint';

export type TabItem = {
  key: string;
  label: string;
  count: number;
  tone?: TabTone;
};

export function Tabs({
  value,
  onChange,
  items,
  className,
}: {
  value: string;
  onChange: (key: string) => void;
  items: TabItem[];
  className?: string;
}) {
  return (
    <div className={cn('flex gap-2 text-sm', className)} role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={item.key === value}
          data-active={item.key === value}
          className={tabButton({ active: item.key === value })}
          onClick={() => onChange(item.key)}
        >
          {item.tone && <Dot sev={item.tone} />}
          {item.label} <span className="font-mono">{item.count}</span>
        </button>
      ))}
    </div>
  );
}
