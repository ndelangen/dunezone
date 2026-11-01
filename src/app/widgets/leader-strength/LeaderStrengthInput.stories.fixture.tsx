import { useState } from 'react';

import { LeaderStrengthInput } from './LeaderStrengthInput';
import type { LeaderStrength } from './LeaderStrengthInput';

/** Owns the strength like a page would, and prints the value the field last handed over. */
export function StrengthField({ initial }: Readonly<{ initial: LeaderStrength }>) {
  /* Two leaders of the same strength, edited one at a time in one reused field, as the faction editor does. */
  const [strengths, setStrengths] = useState<LeaderStrength[]>([initial, initial]);
  const [leader, setLeader] = useState(0);
  const strength = strengths[leader];
  return (
    <div style={{ maxWidth: 240 }}>
      <LeaderStrengthInput
        subject={leader}
        value={strength}
        onChange={(next) => setStrengths((all) => all.map((value, index) => (index === leader ? next : value)))}
      />
      <output aria-label="Saved strength">{strength === undefined ? 'none' : String(strength)}</output>
      <button type="button" onClick={() => setLeader(1 - leader)}>
        Other leader
      </button>
    </div>
  );
}
