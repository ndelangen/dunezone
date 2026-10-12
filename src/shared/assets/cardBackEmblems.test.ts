import { describe, expect, it } from 'vitest';

import { GF9_STRONGHOLD_DECK } from './gf9StrongholdDeck';
import { CardBack, DeckAsset } from './schema';

describe('card back emblems', () => {
  it('rejects a raster illustration in both a card back and an authored deck back', () => {
    const { mode: _mode, ...original } = GF9_STRONGHOLD_DECK.cardback;
    const cardback = {
      ...original,
      image: '/image/decal/gf9-stronghold-arrakeen.png',
    };
    expect(CardBack.safeParse(cardback).success).toBe(false);
    expect(DeckAsset.safeParse({ ...GF9_STRONGHOLD_DECK, cardback: { ...cardback, mode: 'custom' } }).success).toBe(
      false
    );
  });

  it('accepts the palace vector used by the Stronghold deck', () => {
    const { mode: _mode, ...cardback } = GF9_STRONGHOLD_DECK.cardback;
    expect(CardBack.safeParse(cardback).success).toBe(true);
    expect(DeckAsset.safeParse(GF9_STRONGHOLD_DECK).success).toBe(true);
  });
});
