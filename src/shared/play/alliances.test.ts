import { describe, expect, test } from 'vite-plus/test';

import { allianceOf, alliesOf, applyAlliance, emptyAlliances } from './alliances';
import type { AllianceAction, AllianceState } from './alliances';

const FACTIONS = ['atreides', 'harkonnen', 'fremen', 'emperor'];

let revision = 0;
function act(state: AllianceState, factionId: string, action: AllianceAction) {
  revision += 1;
  return applyAlliance(state, action, { factionId, factions: FACTIONS, now: 1, revision });
}

/* The id of the offer `from` made to `to`, as the answering player sees it. */
function offerId(state: AllianceState, from: string, to: string) {
  return state.offers.find((offer) => offer.from === from && offer.to === to)?.id ?? 0;
}

describe('alliances', () => {
  test('an alliance keeps its mark while others form and break, and a new one takes the lowest free mark', () => {
    const ally = (state: AllianceState, from: string, to: string) =>
      ((offered) => act(offered, to, { kind: 'alliance-accept', factionId: from, offer: offerId(offered, from, to) }))(
        act(state, from, { kind: 'alliance-offer', factionId: to })
      );
    let state = ally(emptyAlliances(), 'atreides', 'fremen');
    state = ally(state, 'harkonnen', 'emperor');
    expect(allianceOf(state, 'emperor')?.mark).toBe(1);
    state = act(state, 'atreides', { kind: 'alliance-break', factionId: 'fremen' });
    expect(allianceOf(state, 'emperor')?.mark).toBe(1);
    state = ally(state, 'atreides', 'fremen');
    expect(allianceOf(state, 'fremen')?.mark).toBe(0);
  });

  test('an accepted offer allies both factions and clears the offer', () => {
    const offered = act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    expect(offered.offers).toMatchObject([{ from: 'atreides', to: 'fremen', at: 1 }]);
    const allied = act(offered, 'fremen', {
      kind: 'alliance-accept',
      factionId: 'atreides',
      offer: offerId(offered, 'atreides', 'fremen'),
    });
    expect(alliesOf(allied, 'fremen')).toEqual(['atreides']);
    expect(allied.offers).toEqual([]);
  });

  test('a late offer never re-forms an alliance broken since', () => {
    let state = act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    state = act(state, 'fremen', {
      kind: 'alliance-accept',
      factionId: 'atreides',
      offer: offerId(state, 'atreides', 'fremen'),
    });
    state = act(state, 'fremen', { kind: 'alliance-break', factionId: 'atreides' });
    state = act(state, 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    expect(() => act(state, 'fremen', { kind: 'alliance-offer', factionId: 'atreides' })).toThrow('Accept it instead');
    expect(alliesOf(state, 'fremen')).toEqual([]);
  });

  test('a withdrawn offer leaves everyone alone', () => {
    const offered = act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    expect(
      act(offered, 'atreides', {
        kind: 'alliance-withdraw',
        factionId: 'fremen',
        offer: offerId(offered, 'atreides', 'fremen'),
      })
    ).toEqual(emptyAlliances());
    expect(() => act(emptyAlliances(), 'fremen', { kind: 'alliance-accept', factionId: 'atreides', offer: 0 })).toThrow(
      'withdrawn'
    );
  });

  test('an allied faction neither offers nor accepts another alliance until it breaks its own', () => {
    let state = act(emptyAlliances(), 'emperor', { kind: 'alliance-offer', factionId: 'fremen' });
    state = act(state, 'harkonnen', { kind: 'alliance-offer', factionId: 'atreides' });
    const waiting = offerId(state, 'emperor', 'fremen');
    state = act(state, 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    state = act(state, 'fremen', {
      kind: 'alliance-accept',
      factionId: 'atreides',
      offer: offerId(state, 'atreides', 'fremen'),
    });
    /* Every offer to or from either ally is gone, so neither is left holding one it may not answer. */
    expect(state.offers).toEqual([]);
    expect(() => act(state, 'fremen', { kind: 'alliance-accept', factionId: 'emperor', offer: waiting })).toThrow(
      'withdrawn'
    );
    expect(() => act(state, 'atreides', { kind: 'alliance-offer', factionId: 'emperor' })).toThrow(
      'Break your alliance'
    );
    expect(() => act(state, 'emperor', { kind: 'alliance-offer', factionId: 'fremen' })).toThrow(
      'already in an alliance'
    );
    state = act(state, 'atreides', { kind: 'alliance-break', factionId: 'fremen' });
    expect(state.groups).toEqual([]);
    /* A break sent for an alliance that has since changed is turned away rather than leaving a newer one. */
    expect(() => act(state, 'atreides', { kind: 'alliance-break', factionId: 'fremen' })).toThrow('already changed');
    expect(act(state, 'atreides', { kind: 'alliance-offer', factionId: 'emperor' }).offers).toMatchObject([
      { from: 'atreides', to: 'emperor' },
    ]);
  });

  test('an offer made before the receiver allied elsewhere can no longer be accepted', () => {
    let state = act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    state = act(state, 'harkonnen', { kind: 'alliance-offer', factionId: 'emperor' });
    state = { ...state, groups: [{ members: ['fremen', 'emperor'], mark: 0 }] };
    const fremen = offerId(state, 'atreides', 'fremen');
    expect(() => act(state, 'fremen', { kind: 'alliance-accept', factionId: 'atreides', offer: fremen })).toThrow(
      'Break your alliance'
    );
    const emperor = offerId(state, 'harkonnen', 'emperor');
    expect(() => act(state, 'emperor', { kind: 'alliance-accept', factionId: 'harkonnen', offer: emperor })).toThrow(
      'Break your alliance'
    );
  });

  test('a late answer to a withdrawn offer never reaches an offer made again since', () => {
    let state = act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    const seen = offerId(state, 'atreides', 'fremen');
    state = act(state, 'atreides', { kind: 'alliance-withdraw', factionId: 'fremen', offer: seen });
    state = act(state, 'atreides', { kind: 'alliance-offer', factionId: 'emperor' });
    state = act(state, 'emperor', {
      kind: 'alliance-accept',
      factionId: 'atreides',
      offer: offerId(state, 'atreides', 'emperor'),
    });
    state = act(state, 'atreides', { kind: 'alliance-break', factionId: 'emperor' });
    state = act(state, 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    expect(() => act(state, 'fremen', { kind: 'alliance-accept', factionId: 'atreides', offer: seen })).toThrow(
      'withdrawn'
    );
    expect(state.offers).toMatchObject([{ from: 'atreides', to: 'fremen' }]);
  });

  test('an offer to yourself, an ally or a faction not at the table is refused', () => {
    expect(() => act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'atreides' })).toThrow();
    expect(() => act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'ixians' })).toThrow();
    let state = act(emptyAlliances(), 'atreides', { kind: 'alliance-offer', factionId: 'fremen' });
    state = act(state, 'fremen', {
      kind: 'alliance-accept',
      factionId: 'atreides',
      offer: offerId(state, 'atreides', 'fremen'),
    });
    expect(() => act(state, 'atreides', { kind: 'alliance-offer', factionId: 'fremen' })).toThrow(
      'Break your alliance'
    );
  });
});
