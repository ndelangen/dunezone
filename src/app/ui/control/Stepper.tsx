import { UnstyledButton } from '@mantine/core';
import clsx from 'clsx';
import { Minus, Plus } from 'lucide-react';
import type { ReactNode, WheelEvent } from 'react';
import { useState } from 'react';

import styles from './Stepper.module.css';

/** A value that replays an animation each time it changes: alternates 0 and 1, so the attribute changes on every bump. */
function useBump(value: unknown) {
  const [bump, setBump] = useState<number | undefined>(undefined);
  const [seen, setSeen] = useState(value);
  if (!Object.is(seen, value)) {
    setSeen(value);
    setBump((before) => (before === 0 ? 1 : 0));
  }
  return bump;
}

export type StepperProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  /** What is typed before it commits, or null once it has, so a caller can judge the amount while it is being typed. */
  onDraftChange?: (draft: string | null) => void;
  /** Shown after the value, such as "of 12". */
  suffix?: ReactNode;
  format?: (value: number) => string;
  size?: 'sm' | 'md';
};

/**
 * A count with − and + either side: one click per step, the wheel over it steps too, and typing commits on Enter or blur.
 * At either end the value knocks against its limit instead of silently refusing.
 */
export function Stepper({
  label,
  value,
  min = 0,
  max = Infinity,
  step = 1,
  disabled,
  onChange,
  onDraftChange,
  suffix,
  format = String,
  size = 'md',
}: StepperProps) {
  const [draft, setDraftState] = useState<string | null>(null);
  const [knock, setKnock] = useState<number | undefined>(undefined);
  const bump = useBump(value);
  const setDraft = (next: string | null) => {
    setDraftState(next);
    onDraftChange?.(next);
  };
  const go = (next: number) => {
    const bounded = Math.min(max, Math.max(min, next));
    if (bounded === value) {
      setKnock((before) => (before === 0 ? 1 : 0));
      return;
    }
    onChange(bounded);
  };
  /* What the field holds now: a valid typed count, or the committed one. */
  const current = () => {
    const typed = draft === null || draft.trim() === '' ? NaN : Number(draft);
    return Number.isFinite(typed) ? Math.round(typed / step) * step : value;
  };
  /* A step from the wheel, a key or a button starts from what the field shows, typed or not, and settles the field. */
  const stepBy = (delta: number) => {
    go(current() + delta);
    setDraft(null);
  };
  const wheel = (event: WheelEvent) => {
    if (disabled || !event.deltaY) {
      return;
    }
    stepBy(event.deltaY < 0 ? step : -step);
  };
  const commit = () => {
    if (draft !== null) {
      const next = current();
      if (next !== value) {
        go(next);
      }
      setDraft(null);
    }
  };
  return (
    <div
      className={clsx(styles.stepper, size === 'sm' && styles.stepperSmall)}
      data-knock={knock}
      data-disabled={disabled || undefined}
      onWheel={wheel}
      role="group"
      aria-label={label}
    >
      <UnstyledButton
        className={styles.stepButton}
        aria-label={`Fewer: ${label}`}
        disabled={disabled}
        onClick={() => stepBy(-step)}
      >
        <Minus size={14} />
      </UnstyledButton>
      <input
        className={styles.stepValue}
        data-bump={bump}
        aria-label={label}
        inputMode="decimal"
        disabled={disabled}
        value={draft ?? format(value)}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            stepBy(event.key === 'ArrowUp' ? step : -step);
          }
        }}
      />
      {suffix ? <span className={styles.stepSuffix}>{suffix}</span> : null}
      <UnstyledButton
        className={styles.stepButton}
        aria-label={`More: ${label}`}
        disabled={disabled}
        onClick={() => stepBy(step)}
      >
        <Plus size={14} />
      </UnstyledButton>
    </div>
  );
}
