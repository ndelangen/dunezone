import { useState } from 'react';

import { LeaderStrengthInput } from './LeaderStrengthInput';
import type { LeaderStrength } from './LeaderStrengthInput';

type Refusal = { leader: number; text: string } | null;

/** Owns the strengths and the refused text like a page would, and prints the value the field last handed over. */
export function StrengthField({ initial }: Readonly<{ initial: LeaderStrength }>) {
  /* Two leaders of the same strength, edited one at a time in one reused field, as the faction editor does. */
  const [strengths, setStrengths] = useState<LeaderStrength[]>([initial, initial]);
  const [refusal, setRefusal] = useState<Refusal>(null);
  const [leader, setLeader] = useState(0);
  const strength = strengths[leader];
  return (
    <div style={{ maxWidth: 240 }}>
      <LeaderStrengthInput
        value={strength}
        refused={refusal?.leader === leader ? refusal.text : null}
        onRefusedChange={(text) => setRefusal(text === null ? null : { leader, text })}
        onChange={(next) => setStrengths((all) => all.map((value, index) => (index === leader ? next : value)))}
      />
      <output aria-label="Saved strength">{strength === undefined ? 'none' : String(strength)}</output>
      {/* Moving to another leader drops the refused text, as the faction editor does. */}
      <button
        type="button"
        onClick={() => {
          setLeader(1 - leader);
          setRefusal(null);
        }}
      >
        Other leader
      </button>
      <button
        type="button"
        onClick={() => {
          setStrengths([initial, initial]);
          setRefusal(null);
        }}
      >
        Replace draft
      </button>
    </div>
  );
}
