import { describe, expect, test } from 'vitest';

import { alliesOf, applyAlliance, emptyAlliances } from './alliances';
import type { AllianceAction, AllianceState } from './alliances';

const FACTIONS = ['atreides', 'harkonnen', 'fremen', 'emperor'];

function act(state: AllianceState, factionId: string, action: AllianceAction) {
  return applyAlliance(state, action, { factionId, factions: FACTIONS, now: 1 });
}

describe('alliances', () => {
  test('an accepted offer allies both factions and clears the offer', () => {
    const offered = act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    expect(offered.offers).toEqual([{ from: 'atreides', to: 'fremen', at: 1 }]);
    const allied = act(offered, 'fremen', { kind: 'alliance-accept', factionId: 'atreides' });
    expect(alliesOf(allied, 'fremen')).toEqual(['atreides']);
    expect(allied.offers).toEqual([]);
  });

  test('offering back to a faction that offered answers its offer', () => {
    const offered = act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    const allied = act(offered, 'fremen', { kind: 'alliance-offer', factionId: 'atreides' });
    expect(alliesOf(allied, 'atreides')).toEqual(['fremen']);
  });

  test('a declined or withdrawn offer leaves everyone alone', () => {
    const offered = act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    expect(act(offered, 'fremen', { kind: 'alliance-decline', factionId: 'atreides' })).toEqual(emptyAlliances());
    expect(act(offered, 'atreides', { kind: 'alliance-withdraw', factionId: 'fremen' })).toEqual(emptyAlliances());
    expect(() => act(emptyAlliances(), 'fremen', { kind: 'alliance-accept', factionId: 'atreides' })).toThrow(
      'withdrawn'
    );
  });

  test('a faction joining an alliance joins all of it, and breaking takes only that faction out', () => {
    let state = act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    state = act(state, 'fremen', { kind: 'alliance-accept', factionId: 'atreides' });
    state = act(state, 'emperor', { kind: 'alliance-offer', factionId: 'fremen' });
    state = act(state, 'fremen', { kind: 'alliance-accept', factionId: 'emperor' });
    expect(alliesOf(state, 'emperor').sort()).toEqual(['atreides', 'fremen']);
    state = act(state, 'emperor', { kind: 'alliance-break' });
    expect(alliesOf(state, 'atreides')).toEqual(['fremen']);
    state = act(state, 'atreides', { kind: 'alliance-break' });
    expect(state.groups).toEqual([]);
  });

  test('an offer to yourself, an ally or a faction not at the table is refused', () => {
    expect(() => act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'atreides' })).toThrow();
    expect(() => act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'ixians' })).toThrow();
    let state = act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    state = act(state, 'fremen', { kind: 'alliance-accept', factionId: 'atreides' });
    expect(() => act(state, 'atreides', { kind: 'alliance-offer', factionId: 'fremen' })).toThrow('already allied');
  });
});
