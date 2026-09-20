import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cardPage, deckPage } from './native-catalogue.fixture.mjs';
import {
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  provision,
  sendCommand,
  syncView,
} from './native-runtime.fixture.mjs';

/* The catalogue's Dreamrules deck as the peer serves it: three card faces on one cardback. */
function seedDreamrules(peer) {
  const cards = [cardPage('supplies'), cardPage('shield'), cardPage('snooper')];
  const deck = deckPage('dreamrules-treachery-deck', cards, 2);
  deck.asset.name = 'Dreamrules Treachery Deck';
  for (const page of [...cards, deck]) {
    peer.catalogue.set(`${page.asset.type}/${page.asset.slug}`, page);
  }
}

const treachery = (view) => ({
  deck: view.snapshot.table.pieces.find((piece) => piece.id === 'treachery-deck'),
  loose: view.snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose'),
});

describe('The hosted fixture deals the catalogue treachery deck', () => {
  let peer, runtime;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  it('deals real cards at provisioning, keeps them through a reset and a restart, and keeps the fixture ids', async () => {
    seedDreamrules(peer);
    runtime = await createRuntime(peer, 'game');
    expect((await provision(runtime)).status).toBe(200);
    const a = await admitPlayer(peer, runtime, 'a');
    const dealt = treachery(await syncView(a));
    expect(dealt.deck.label).toBe('Treachery deck');
    expect(dealt.deck.items).toHaveLength(5);
    expect(dealt.deck.items.every((item) => !item.faceUp)).toBe(true);
    /* Face-down cards show the deck's back and no front: the projection keeps hidden faces hidden. */
    expect(dealt.deck.items[0].artwork).toEqual({
      back: 'http://table.test/published/decks/dreamrules-treachery-deck/cardback.jpg',
      type: 'card-treachery',
    });
    expect(dealt.loose.items).toHaveLength(1);
    expect(dealt.loose.items[0]).toMatchObject({
      faceUp: true,
      artwork: { front: 'http://table.test/published/cards/snooper/card.jpg', name: 'snooper' },
    });
    /* A reset rebuilds the fixture with the same deck, not the placeholder. */
    const reset = await sendCommand(a, { kind: 'reset' });
    expect(reset.reply.type).not.toBe('rejected');
    expect(treachery(await syncView(a)).loose.items[0].artwork.front).toContain('snooper');
    await runtime.restart();
    const back = treachery(await syncView(await admitPlayer(peer, runtime, 'a')));
    expect(back.deck.items).toHaveLength(5);
    expect(back.deck.items[0].artwork.back).toContain('cardback');
  });

  it('keeps the placeholder cards when the catalogue has no deck, and adopts the deck on a later wake', async () => {
    runtime = await createRuntime(peer, 'game');
    expect((await provision(runtime)).status).toBe(200);
    const a = await admitPlayer(peer, runtime, 'a');
    const placeholder = treachery(await syncView(a));
    expect(placeholder.deck.items).toHaveLength(4);
    expect(placeholder.deck.items[0].artwork).toBeUndefined();

    seedDreamrules(peer);
    await runtime.restart();
    const b = await admitPlayer(peer, runtime, 'a');
    /* The woken room captures the deck on its own; the table is untouched until someone resets it. */
    await eventually(
      () =>
        peer.requests.some(
          (request) => request.function === 'assets:getPage' && request.args.slug === 'snooper' && request.completedAt
        ),
      'deck adopted on wake'
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(treachery(await syncView(b)).deck.items[0].artwork).toBeUndefined();
    const reset = await sendCommand(b, { kind: 'reset' });
    expect(reset.reply.type).not.toBe('rejected');
    const dealt = treachery(await syncView(b));
    expect(dealt.deck.items).toHaveLength(5);
    expect(dealt.loose.items[0].artwork.front).toContain('snooper');
  });
});
