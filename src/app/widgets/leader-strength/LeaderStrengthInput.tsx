import { TextInput } from '@mantine/core';
import { useState } from 'react';

export type LeaderStrength = number | string | undefined;

const REJECTED = 'Use a whole number or one character.';

/**
 * Blank omits the strength, digits make a number, and any other single character is kept as printed.
 * A lone minus is the start of a negative number, so it is not taken as the character.
 */
export function parseLeaderStrength(raw: string): { value: LeaderStrength } | null {
  if (!raw) {
    return { value: undefined };
  }
  if (raw === '-') {
    return null;
  }
  if (/^-?\d+$/u.test(raw)) {
    return { value: Number.parseInt(raw, 10) };
  }
  return raw.length === 1 ? { value: raw } : null;
}

type Subject = string | number | undefined;

/*
 * The refused text belongs to the leader and the value it was typed over, and lives only while the field has focus.
 * Once the field edits another leader, or the value changes, it is discarded, so switching back cannot bring it back.
 */
function useRefusal(accepted: string, subject: Subject) {
  const [refused, setRefused] = useState<{ text: string; over: string; subject: Subject } | null>(null);
  const current = refused !== null && refused.over === accepted && refused.subject === subject;
  if (refused !== null && !current) {
    setRefused(null);
  }
  return {
    shown: current ? refused.text : null,
    refuse: (text: string) => setRefused({ text, over: accepted, subject }),
    clear: () => setRefused(null),
  };
}

const strengthText = (value: LeaderStrength | null) => (value === undefined || value === null ? '' : String(value));

/**
 * A leader's printed strength.
 * Text the field cannot take stays visible with the reason, instead of the keystroke vanishing, and the strength keeps its last good value until the text is fixed.
 */
export function LeaderStrengthInput({
  id,
  subject,
  value,
  onChange,
  onBlur,
}: Readonly<{
  id?: string;
  /** Which leader the field edits, when one field is reused for several. */
  subject?: string | number;
  value: LeaderStrength | null;
  onChange: (value: LeaderStrength) => void;
  onBlur?: () => void;
}>) {
  const accepted = strengthText(value);
  const refusal = useRefusal(accepted, subject);
  /* A lone minus is a negative number on its way, not a mistake to warn about. */
  const warn = refusal.shown !== null && refusal.shown !== '-';
  return (
    <TextInput
      id={id}
      aria-label="Strength"
      inputMode="text"
      autoComplete="off"
      value={refusal.shown ?? accepted}
      error={warn ? REJECTED : undefined}
      onBlur={() => {
        refusal.clear();
        onBlur?.();
      }}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        const parsed = parseLeaderStrength(raw);
        if (parsed) {
          refusal.clear();
          onChange(parsed.value);
        } else {
          refusal.refuse(raw);
        }
      }}
    />
  );
}
