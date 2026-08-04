import { Search } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';

import styles from './ToolbarSearchField.module.css';

export type ToolbarSearchFieldProps = {
  value: string;
  onValueChange: (value: string) => void;
  'aria-label': string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  iconSize?: number;
} & Pick<ComponentPropsWithoutRef<'input'>, 'name' | 'autoComplete'> & {
    className?: string;
  };

/**
 * Compact search control for {@link Toolbar} rows: leading search icon + styled text field for
 * filtering lists or syncing search state to the URL.
 */
export function ToolbarSearchField({
  value,
  onValueChange,
  'aria-label': ariaLabel,
  placeholder,
  disabled,
  id,
  name,
  autoComplete,
  iconSize = 18,
  className,
}: ToolbarSearchFieldProps) {
  const rootClass = className ? `${styles.root} ${className}` : styles.root;

  return (
    <div className={rootClass}>
      <Search className={styles.icon} size={iconSize} aria-hidden />
      <input
        id={id}
        name={name}
        type="search"
        className={styles.input}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        autoComplete={autoComplete}
      />
    </div>
  );
}
