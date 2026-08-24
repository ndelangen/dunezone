import { NumberInput } from '@mantine/core';
import { useState } from 'react';

/**
 * A membership count the author types freely and commits once, because each commit is a database write.
 *
 * Membership is not draft state: committing writes an `asset_relations` row and touches the container, so a plain controlled `NumberInput` would persist every keystroke.
 * Typing `12` over `3` would write 1 and then 12, and clearing the field to retype would write 1 on its own, which survives if the author then navigates away.
 * The typed text lives here until blur or Enter, and the committed value reclaims the field whenever it changes, which also restores the display after a rejected commit.
 */
export function MemberCountInput({
  label,
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onCommit: (count: number) => void;
}) {
  const [typed, setTyped] = useState<string | number>(value);
  const [seeded, setSeeded] = useState(value);
  /* Reset during render, the search box's pattern: a committed change arriving from elsewhere must not
     show the stale draft for a paint first. */
  if (value !== seeded) {
    setSeeded(value);
    setTyped(value);
  }

  const commit = () => {
    const next = Math.min(max, Math.max(min, Math.round(Number(typed) || min)));
    setTyped(next);
    if (next !== value) {
      onCommit(next);
    }
  };

  return (
    <NumberInput
      aria-label={label}
      min={min}
      max={max}
      w={90}
      disabled={disabled}
      value={typed}
      onChange={setTyped}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
    />
  );
}
