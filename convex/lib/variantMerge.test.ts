import { describe, expect, test } from 'vite-plus/test';

import { matchingFields, rewriteComponentReferences } from './variantMerge';

describe('rewriting leader and troop references after a merge (#2932)', () => {
  const maps = new Map([['moved', { members: { old: 'new' }, troops: { 'old-troop': 'new-troop' } }]]);

  test('rewrites only under the nearest factionId that moved', () => {
    const side = {
      factionId: 'moved',
      leader: { kind: 'faction-member', factionId: 'other', memberId: 'old' },
      troops: [{ troopId: 'old-troop' }],
      knownCard: { memberId: 'old' },
    };
    expect(rewriteComponentReferences(side, maps)).toEqual({
      value: { ...side, troops: [{ troopId: 'new-troop' }], knownCard: { memberId: 'new' } },
      rewritten: 2,
    });
  });

  test('never reads an inherited property of the map as an id', () => {
    const value = { factionId: 'moved', memberId: 'constructor' };
    expect(rewriteComponentReferences(value, maps)).toEqual({ value, rewritten: 0 });
  });

  test('compares content with ids left out, and a field both leave out matches', () => {
    const base = { factionLeader: { name: 'A', memberId: '1' }, leaders: [], troops: [] };
    const fields = matchingFields(base, { ...base, factionLeader: { name: 'A', memberId: '2' } });
    expect(fields).toContain('factionLeader');
    expect(fields).toContain('planet');
  });
});
