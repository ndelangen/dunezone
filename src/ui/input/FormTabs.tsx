import * as Tabs from '@radix-ui/react-tabs';
import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './Form.module.css';

export interface FormTabsItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
}

interface FormTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  items: readonly FormTabsItem[];
  children?: ReactNode;
  className?: string;
}

interface FormTabsPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function FormTabs({ value, onValueChange, items, children, className }: FormTabsProps) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={onValueChange}
      className={clsx(styles.tabsRoot, className)}
    >
      <Tabs.List className={styles.tabsList} aria-label="Section tabs">
        {items.map((item) => (
          <Tabs.Trigger
            key={item.value}
            value={item.value}
            aria-label={item.ariaLabel}
            disabled={item.disabled}
            className={styles.tabsTrigger}
          >
            {item.icon && <span className={styles.tabsTriggerIcon}>{item.icon}</span>}
            <span className={styles.tabsTriggerLabel}>{item.label}</span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {children}
    </Tabs.Root>
  );
}

export function FormTabsPanel({ value, children, className }: FormTabsPanelProps) {
  return (
    <Tabs.Content value={value} className={clsx(styles.tabsPanel, className)}>
      {children}
    </Tabs.Content>
  );
}
