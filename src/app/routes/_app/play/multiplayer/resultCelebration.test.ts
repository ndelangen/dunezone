import type { GameSnapshot } from '@shared/play/protocol';
import { tableSeatAngles } from '@shared/play/tableSettings';
import { describe, expect, it } from 'vitest';

import { celebrationFor } from './resultCelebration';

const DECLARED = 1_000_000;

function finished(kind: 'faction' | 'alliance' | 'none', factionIds: string[]): GameSnapshot {
  return {
    stage: 'finished',
    roster: {
      seatCount: 5,
      seats: [
        {
          id: 'a',
          position: 0,
          faction: { id: 'atreides', name: 'Atreides', color: '#0a0' },
        },
        {
          id: 'b',
          position: 3,
          faction: { id: 'harkonnen', name: 'Harkonnen', color: '#a00' },
        },
        {
          id: 'c',
          position: 4,
          faction: { id: 'fremen', name: 'Fremen', color: '#aa0' },
        },
      ],
    },
    result: {
      kind,
      factionIds,
      by: { seat: 'a', name: 'Ann' },
      declaredAt: DECLARED,
    },
  } as unknown as GameSnapshot;
}

describe('celebrationFor', () => {
  const angles = tableSeatAngles(5);

  it('fires from the winning faction slot', () => {
    expect(celebrationFor(finished('faction', ['harkonnen']), DECLARED)).toEqual({
      id: DECLARED,
      angles: [angles[3]],
      elapsed: 0,
    });
  });

  it('fires from every allied winner together', () => {
    expect(celebrationFor(finished('alliance', ['fremen', 'atreides']), DECLARED + 2500)).toEqual({
      id: DECLARED,
      angles: [angles[0], angles[4]],
      elapsed: 2.5,
    });
  });

  it('fires nothing for no winner, an old result or a game still in play', () => {
    expect(celebrationFor(finished('none', []), DECLARED)).toBeNull();
    expect(celebrationFor(finished('faction', ['atreides']), DECLARED + 16_000)).toBeNull();
    expect(celebrationFor({ ...finished('faction', ['atreides']), stage: 'play' }, DECLARED)).toBeNull();
  });

  it('treats a clock that runs behind the declaration as the start', () => {
    expect(celebrationFor(finished('faction', ['atreides']), DECLARED - 300)?.elapsed).toBe(0);
  });
});
