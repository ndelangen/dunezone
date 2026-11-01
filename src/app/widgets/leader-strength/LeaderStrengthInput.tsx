import { TextInput } from '@mantine/core';
import { useState } from 'react';

export type LeaderStrength = number | string | undefined;

const REJECTED = 'Use a whole number or one character.';

/** Blank omits the strength, digits make a number, and any other single character is kept as printed. */
export function parseLeaderStrength(raw: string): { value: LeaderStrength } | null {
  if (!raw) {
    return { value: undefined };
  }
  if (/^-?\d+$/u.test(raw)) {
    return { value: Number.parseInt(raw, 10) };
  }
  return raw.length === 1 ? { value: raw } : null;
}

/**
 * A leader's printed strength.
 * Text the field cannot take stays visible with the reason, instead of the keystroke vanishing, and the strength keeps its last good value until the text is fixed.
 */
export function LeaderStrengthInput({
  id,
  value,
  onChange,
  onBlur,
}: Readonly<{
  id?: string;
  value: LeaderStrength | null;
  onChange: (value: LeaderStrength) => void;
  onBlur?: () => void;
}>) {
  const accepted = value === undefined || value === null ? '' : String(value);
  /* The refused text belongs to the value it was typed over; once that value changes, it is moot. */
  const [refused, setRefused] = useState<{ text: string; over: string } | null>(null);
  const shown = refused?.over === accepted ? refused.text : null;
  return (
    <TextInput
      id={id}
      aria-label="Strength"
      inputMode="text"
      autoComplete="off"
      value={shown ?? accepted}
      error={shown === null ? undefined : REJECTED}
      onBlur={onBlur}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        const parsed = parseLeaderStrength(raw);
        if (parsed) {
          setRefused(null);
          onChange(parsed.value);
        } else {
          setRefused({ text: raw, over: accepted });
        }
      }}
    />
  );
}
