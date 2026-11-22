import { describe, expect, it } from 'vite-plus/test';

import { initialSnapshot } from '../../src/shared/play/commands';
import { ACTION_POLICY, isReadiness, leavesTableSettled, revisionTolerant } from './actionPolicy';
import { Room } from './room';

const kinds = Object.keys(ACTION_POLICY);
const where = (test: (kind: string) => boolean) => kinds.filter(test).toSorted();

describe('ACTION_POLICY', () => {
  it('names readiness and the moves that leave a readied table settled', () => {
    expect(where(isReadiness)).toEqual(['draft-ready', 'ready', 'swap-ready']);
    expect(where(leavesTableSettled)).toEqual(['draft-ready', 'ready', 'seat-request', 'seat-withdraw', 'swap-ready']);
  });

  it('treats an unknown kind as strict', () => {
    expect(revisionTolerant('no-such-move')).toBe(false);
    expect(leavesTableSettled('no-such-move')).toBe(false);
  });

  /* Arranging one's own hand and switching the bid clock cross another seat's change; spending from the spice reserve does not (alliance-break is covered in alliances.test.ts). */
  it('lets the room cross a stale revision only for tolerant moves', () => {
    const room = new Room({ ...initialSnapshot(), revision: 3 }, () => []);
    expect(() => room.assertRevision({ kind: 'hand-zone' }, 2)).not.toThrow();
    expect(() => room.assertRevision({ kind: 'bid-timing' }, 2)).not.toThrow();
    expect(() => room.assertRevision({ kind: 'bank-withdraw' }, 2)).toThrow('table changed');
  });
});
