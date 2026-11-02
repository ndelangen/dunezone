import { TextInput } from '@mantine/core';

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

const strengthText = (value: LeaderStrength | null) => (value === undefined || value === null ? '' : String(value));

/**
 * A leader's printed strength.
 * Text the field cannot take stays visible with the reason, instead of the keystroke vanishing, and the strength keeps its last good value until the text is fixed.
 * The refused text is part of the caller's draft session, so replacing the draft clears it (AGENTS.md, "Derive, don't mirror").
 */
export function LeaderStrengthInput({
  id,
  value,
  refused,
  onChange,
  onRefusedChange,
  onBlur,
}: Readonly<{
  id?: string;
  value: LeaderStrength | null;
  /** Text the field could not take, held by the caller until it is fixed or the field loses focus. */
  refused: string | null;
  onChange: (value: LeaderStrength) => void;
  onRefusedChange: (refused: string | null) => void;
  onBlur?: () => void;
}>) {
  /* A lone minus is a negative number on its way, not a mistake to warn about. */
  const warn = refused !== null && refused !== '-';
  return (
    <TextInput
      id={id}
      aria-label="Strength"
      inputMode="text"
      autoComplete="off"
      value={refused ?? strengthText(value)}
      error={warn ? REJECTED : undefined}
      onBlur={() => {
        if (refused !== null) {
          onRefusedChange(null);
        }
        onBlur?.();
      }}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        const parsed = parseLeaderStrength(raw);
        if (!parsed) {
          onRefusedChange(raw);
          return;
        }
        if (refused !== null) {
          onRefusedChange(null);
        }
        onChange(parsed.value);
      }}
    />
  );
}
