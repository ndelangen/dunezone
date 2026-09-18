import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cardPage, deckPage, slot } from './native-catalogue.fixture.mjs';
import { admitPlayer, createPeer, createRuntime, provision, sendCommand, syncView } from './native-runtime.fixture.mjs';

const CREATOR = { userId: 'user-a', displayName: 'Synthetic A' };

describe('A real game provisions from its ruleset', () => {
  let peer, runtime;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.game = { rulesetId: 'ruleset-one', minimumPlayers: 4, creator: CREATOR };
    runtime = await createRuntime(peer, 'game');
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  function seedRuleset(pages, slots) {
    for (const page of pages) {
      peer.catalogue.set(`${page.asset.type}/${page.asset.slug}`, page);
    }
    peer.rulesets.set('ruleset-one', { ruleset: { id: 'ruleset-one', slug: 'classic', name: 'Classic' }, slots });
  }
  const reads = (name) => peer.requests.filter((request) => request.function === name).length;

  it('retains the ruleset, opens drafting on an empty table with the creator at the first seat, and seats no newcomer', async () => {
    const card = cardPage('card-one');
    const [treachery, spice] = [deckPage('treachery-deck', [card]), deckPage('spice-deck', [card], 5)];
    seedRuleset([card, treachery, spice], [slot('treachery', treachery), slot('spice', spice)]);

    expect((await provision(runtime)).status).toBe(200);
    expect((await runtime.captures()).ruleset.ruleset).toEqual({ id: 'ruleset-one', slug: 'classic', name: 'Classic' });
    /* A room that exists refuses another provisioning request and recaptures nothing. */
    expect((await provision(runtime)).status).toBe(403);
    expect(reads('playCatalogue:rulesetSupply')).toBe(1);

    const creator = await admitPlayer(peer, runtime, 'a');
    const view = await syncView(creator);
    expect(view.snapshot.stage).toBe('drafting');
    expect(view.snapshot.table.pieces).toEqual([]);
    expect(view.snapshot.roster).toEqual({ seatCount: 4, seats: [{ id: 'seat-1', position: 0, faction: null }] });
    expect(view.viewer.viewerSeat).toBe('seat-1');
    expect(view.snapshot.controls.seats).toEqual(['seat-1']);

    const newcomer = await admitPlayer(peer, runtime, 'b');
    expect((await syncView(newcomer)).viewer.viewerSeat).toBe('neutral');
    expect((await syncView(creator)).snapshot.roster.seats).toHaveLength(1);

    /* Phases belong to play; drafting has none to step. */
    const { reply } = await sendCommand(creator, { kind: 'phase', direction: 1 });
    expect(reply).toMatchObject({ type: 'rejected', message: 'The game has not started playing yet.' });

    await runtime.restart();
    const back = await syncView(await admitPlayer(peer, runtime, 'a'));
    expect(back.snapshot.stage).toBe('drafting');
    expect(back.viewer.viewerSeat).toBe('seat-1');
    expect((await runtime.captures()).ruleset.ruleset.id).toBe('ruleset-one');
  });

  it('refuses a ruleset that is not ready, except on an isolated backend that allows provisional content', async () => {
    const card = cardPage('card-one');
    const treachery = deckPage('treachery-deck', [card]);
    seedRuleset([card, treachery], [slot('treachery', treachery)]);

    peer.provisional = false;
    expect((await provision(runtime)).status).not.toBe(200);
    expect((await runtime.captures()).ruleset).toBeNull();

    peer.provisional = true;
    expect((await provision(runtime)).status).toBe(200);
    const captures = await runtime.captures();
    expect(captures.ruleset.readiness.ready).toBe(false);
    expect((await syncView(await admitPlayer(peer, runtime, 'a'))).snapshot.stage).toBe('drafting');
  });
});
