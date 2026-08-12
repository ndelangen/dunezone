import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { Pipette } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import { HexColorPicker as ColorfulHexPicker } from 'react-colorful';

import { FormTooltip } from './FormTooltip';
import styles from './HexColorPicker.module.css';
import { PrefixedField } from './PrefixedField';
import { TextField } from './TextField';

function normalizePickerHex(hex: string): string {
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return hex.toLowerCase();
  }
  return '#000000';
}

export type HexColorPickerProps = {
  pickerId: string;
  textId: string;
  value: string;
  onChange: (next: string) => void;
  pickerAriaLabel: string;
  onBlur?: () => void;
  placeholder?: string;
} & Pick<ComponentPropsWithoutRef<'div'>, 'className'>;

/** Swatch + popover (react-colorful) + hex text in one bordered control. App-wide form primitive. */
export function HexColorPicker({
  pickerId,
  textId,
  value,
  onChange,
  onBlur,
  pickerAriaLabel,
  placeholder = '#rrggbb',
  className,
}: HexColorPickerProps) {
  const pickerValue = normalizePickerHex(value);

  return (
    <PrefixedField
      className={clsx(styles.hexColorRow, className)}
      prefix={
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              id={pickerId}
              type="button"
              className={styles.hexColorPickerWrap}
              aria-label={pickerAriaLabel}
            >
              <span
                className={styles.hexColorSwatch}
                style={{ backgroundColor: pickerValue }}
                aria-hidden
              />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className={styles.hexColorPopover}
              side="bottom"
              align="start"
              sideOffset={8}
              collisionPadding={10}
            >
              <ColorfulHexPicker
                color={pickerValue}
                onChange={(next) => onChange(normalizePickerHex(next))}
              />
              <div className={styles.hexColorPopoverFooter}>
                <span className={styles.hexColorPopoverValue}>{pickerValue}</span>
                <FormTooltip content="Open system color picker">
                  <label className={styles.hexColorNativePickerButton}>
                    <Pipette size={14} aria-hidden />
                    <input
                      className={styles.hexColorNativePickerInput}
                      type="color"
                      value={pickerValue}
                      onChange={(e) => onChange(normalizePickerHex(e.target.value))}
                      aria-label={pickerAriaLabel}
                    />
                  </label>
                </FormTooltip>
              </div>
              <Popover.Arrow className={styles.hexColorPopoverArrow} width={10} height={6} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      }
    >
      <TextField
        id={textId}
        className={styles.hexColorHexInput}
        type="text"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
      />
    </PrefixedField>
  );
}
