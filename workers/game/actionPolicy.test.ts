import { describe, expect, it } from 'vite-plus/test';

import { ACTION_POLICY, revisionTolerant, isReadiness, leavesTableSettled } from './actionPolicy';

const kinds = Object.keys(ACTION_POLICY);
const where = (test: (kind: string) => boolean) => kinds.filter(test).toSorted();

describe('ACTION_POLICY', () => {
  /* The comment beside each of these entries says why it waits for the sender to see the live table. */
  it('keeps the moves that must see the live table strict', () => {
    for (const kind of [
      'alliance-break',
      'seat-depart',
      'bank-withdraw',
      'reset',
      'phase',
      'storm',
      'split',
      'stack',
    ]) {
      expect(revisionTolerant(kind), kind).toBe(false);
    }
  });

  it('lets moves that name only their own target cross another seat', () => {
    for (const kind of [
      'hand-zone',
      'hand-order',
      'bid-seconds',
      'bid-timing',
      'battle-plan',
      'draft-pick',
      'seat-request',
    ]) {
      expect(revisionTolerant(kind), kind).toBe(true);
    }
  });

  it('names readiness and the moves that leave a readied table settled', () => {
    expect(where(isReadiness)).toEqual(['draft-ready', 'ready', 'swap-ready']);
    expect(where(leavesTableSettled)).toEqual(['draft-ready', 'ready', 'seat-request', 'seat-withdraw', 'swap-ready']);
  });

  it('treats an unknown kind as strict', () => {
    expect(revisionTolerant('no-such-move')).toBe(false);
    expect(leavesTableSettled('no-such-move')).toBe(false);
  });
});
