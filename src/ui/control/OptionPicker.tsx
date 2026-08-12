import * as Select from '@radix-ui/react-select';
import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './Form.module.css';
import type { TextFieldAppearance } from './TextField';
import { textFieldClassNames } from './TextField';

interface OptionPickerOption {
  value: string;
  label: ReactNode;
}

interface OptionPickerProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly OptionPickerOption[];
  placeholder?: string;
  ariaLabel?: string;
  triggerClassName?: string;
  appearance?: TextFieldAppearance;
}

export function OptionPicker({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  ariaLabel,
  triggerClassName,
  appearance,
}: OptionPickerProps) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger
        className={clsx(
          textFieldClassNames({
            variant: 'input',
            padded: false,
            embedded: appearance === 'embedded',
          }),
          styles.selectTrigger,
          triggerClassName
        )}
        aria-label={ariaLabel}
      >
        <Select.Value className={styles.selectValue} placeholder={placeholder} />
        <Select.Icon className={styles.selectIcon}>
          <ChevronDown size={16} aria-hidden />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className={styles.selectContent} position="popper" sideOffset={6}>
          <Select.Viewport className={styles.selectViewport}>
            {options.map((option) => {
              return (
                <Select.Item key={option.value} value={option.value} className={styles.selectItem}>
                  <Select.ItemText className={styles.selectItemText}>
                    {option.label}
                  </Select.ItemText>
                  <Select.ItemIndicator className={styles.selectItemIndicator}>
                    <Check size={14} aria-hidden />
                  </Select.ItemIndicator>
                </Select.Item>
              );
            })}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
