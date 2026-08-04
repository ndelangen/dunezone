import { type ReactNode, useLayoutEffect } from 'react';

import styles from './LabeledRangeInput.module.css';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export interface LabeledRangeInputProps {
  id: string;
  label: ReactNode;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step: number;
  /** Shown next to the label (e.g. fixed decimals). */
  formatDisplay?: (n: number) => string;
  /** Round to integer before clamp (e.g. decal offsets). */
  integer?: boolean;
}

/**
 * Native range input with label and optional live value display. Optionally syncs the parent when
 * the numeric value is out of `[min, max]` after normalization.
 */
export function LabeledRangeInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  formatDisplay,
  integer = false,
}: LabeledRangeInputProps) {
  const raw = Number(value);
  let numeric = Number.isFinite(raw) ? raw : min;
  if (integer) {
    numeric = Math.round(numeric);
  }
  const normalized = clamp(numeric, min, max);

  useLayoutEffect(() => {
    if (numeric !== normalized) {
      onChange(normalized);
    }
  }, [numeric, normalized, onChange]);

  const display = formatDisplay != null ? formatDisplay(normalized) : String(normalized);

  return (
    <label className={styles.label} htmlFor={id}>
      {label}
      <span className={styles.value}>{display}</span>
      <input
        id={id}
        className={styles.input}
        type="range"
        min={min}
        max={max}
        step={step}
        value={normalized}
        onChange={(e) => {
          const parsed =
            step === Math.floor(step)
              ? Number.parseInt(e.target.value, 10)
              : Number.parseFloat(e.target.value);
          const next = Number.isFinite(parsed) ? parsed : min;
          onChange(integer ? clamp(Math.round(next), min, max) : clamp(next, min, max));
        }}
      />
    </label>
  );
}
