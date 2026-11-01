import { useState } from 'react';

import { LeaderStrengthInput } from './LeaderStrengthInput';
import type { LeaderStrength } from './LeaderStrengthInput';

/** Owns the strength like a page would, and prints the value the field last handed over. */
export function StrengthField({ initial }: Readonly<{ initial: LeaderStrength }>) {
  const [strength, setStrength] = useState<LeaderStrength>(initial);
  return (
    <div style={{ maxWidth: 240 }}>
      <LeaderStrengthInput value={strength} onChange={setStrength} />
      <output aria-label="Saved strength">{strength === undefined ? 'none' : String(strength)}</output>
    </div>
  );
}
