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

const FRONTS = ['supplies', 'shield', 'snooper'].map((slug) => `http://table.test/published/cards/${slug}/card.jpg`);
const BACK = 'http://table.test/published/decks/dreamrules-treachery-deck/cardback.jpg';

/* The catalogue's Dreamrules deck as the peer serves it: three card faces, two of each, on one cardback. */
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

/** The fixture's two treachery pieces hold the whole dealt deck: five hidden cards and one shown face. */
function expectDealt({ deck, loose }) {
  expect(deck.label).toBe('Treachery deck');
  expect(deck.items).toHaveLength(5);
  /* Face-down cards show the deck's back and no front: the projection keeps hidden faces hidden. */
  for (const item of deck.items) {
    expect(item.faceUp).toBe(false);
    expect(item.artwork).toEqual({ back: BACK, type: 'card-treachery' });
  }
  expect(loose.items).toHaveLength(1);
  expect(loose.items[0].faceUp).toBe(true);
  expect(FRONTS).toContain(loose.items[0].artwork.front);
}

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

  const readJson = async (table) => JSON.parse((await runtime.exec(`SELECT data FROM ${table} WHERE id=1`))[0].data);

  it('deals real cards into the fixture pieces at provisioning, hiding the face-down fronts', async () => {
    seedDreamrules(peer);
    runtime = await createRuntime(peer, 'game');
    expect((await provision(runtime)).status).toBe(200);
    expectDealt(treachery(await syncView(await admitPlayer(peer, runtime, 'a'))));
    expect((await readJson('metadata')).fixtureDeck.definitions).toEqual([]);
  });

  it('deals the retained deck again on a reset, reshuffled with fresh identities, after a restart', async () => {
    seedDreamrules(peer);
    runtime = await createRuntime(peer, 'game');
    expect((await provision(runtime)).status).toBe(200);
    const first = treachery(await syncView(await admitPlayer(peer, runtime, 'a')));
    await runtime.restart();
    const a = await admitPlayer(peer, runtime, 'a');
    const reset = await sendCommand(a, { kind: 'reset' });
    expect(reset.reply.type).not.toBe('rejected');
    const dealt = treachery(await syncView(a));
    expectDealt(dealt);
    /* A card seen once is not recognisable after the next deal: every identity is new. */
    const before = new Set([...first.deck.items, ...first.loose.items].map((item) => item.id));
    expect([...dealt.deck.items, ...dealt.loose.items].some((item) => before.has(item.id))).toBe(false);
  });

  it('keeps the placeholder cards when the catalogue has no deck, and adopts the deck on a later wake', async () => {
    runtime = await createRuntime(peer, 'game');
    expect((await provision(runtime)).status).toBe(200);
    const placeholder = treachery(await syncView(await admitPlayer(peer, runtime, 'a')));
    expect(placeholder.deck.items).toHaveLength(4);
    expect(placeholder.deck.items[0].artwork).toBeUndefined();
    expect((await readJson('metadata')).fixtureDeck).toBeUndefined();

    seedDreamrules(peer);
    const revision = (await readJson('current_state')).revision;
    await runtime.restart();
    /* The woken room retains the deck on its own and leaves the table alone until someone resets it. */
    await eventually(async () => (await readJson('metadata')).fixtureDeck !== undefined, 'deck adopted on wake');
    expect((await readJson('current_state')).revision).toBe(revision);
    const b = await admitPlayer(peer, runtime, 'a');
    expect(treachery(await syncView(b)).deck.items[0].artwork).toBeUndefined();
    const reset = await sendCommand(b, { kind: 'reset' });
    expect(reset.reply.type).not.toBe('rejected');
    expectDealt(treachery(await syncView(b)));
  });
});
