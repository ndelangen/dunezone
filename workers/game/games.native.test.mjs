import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { arrakisBoardCapture } from '../../src/shared/play/fixtures/board';
import { cardPage, deckPage, slot } from './native-catalogue.fixture.mjs';
import {
  admitPlayer,
  createPeer,
  createRuntime,
  provision,
  sendCommand,
  syncView,
  eventually,
} from './native-runtime.fixture.mjs';

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
    peer.rulesets.set('ruleset-one', {
      board: arrakisBoardCapture,
      ruleset: { id: 'ruleset-one', slug: 'classic', name: 'Classic' },
      slots,
    });
  }
  const reads = (name) => peer.requests.filter((request) => request.function === name).length;

  it('reports the catalogue refusal to the directory without initializing a game', async () => {
    peer.provisional = false;
    const card = cardPage('unpublished');
    card.front = null;
    const treachery = deckPage('treachery-deck', [card]);
    const spice = deckPage('spice-deck', [card]);
    seedRuleset([card, treachery, spice], [slot('treachery', treachery), slot('spice', spice)]);

    expect((await provision(runtime)).status).toBe(403);
    const refusal = peer.requests.find((request) => request.function === 'playProvisioning:failProvisioning');
    expect(refusal?.args).toMatchObject({
      ...peer.requests.find((request) => request.function === 'playProvisioning:validateProvisioning').args,
      reason:
        'This ruleset is not ready: treachery: treachery-deck, Publish every member and back before requesting this asset.',
    });
    expect(await runtime.exec('SELECT * FROM metadata')).toEqual([]);
    expect((await runtime.captures()).ruleset).toBeNull();
  });

  it('requires a usable board even for provisional creation', async () => {
    seedRuleset([], []);
    peer.rulesets.get('ruleset-one').board = null;
    peer.provisional = true;
    expect((await provision(runtime)).status).not.toBe(200);
    expect((await runtime.captures()).ruleset).toBeNull();
  });

  it('keeps the captured board through source changes, history and restart without copying it into history storage', async () => {
    const card = cardPage('card-one');
    const treachery = deckPage('treachery', [card]),
      spice = deckPage('spice', [card]);
    seedRuleset([card, treachery, spice], [slot('treachery', treachery), slot('spice', spice)]);
    const captured = structuredClone(arrakisBoardCapture);
    captured.asset.name = 'The original board';
    peer.rulesets.get('ruleset-one').board = captured;
    expect((await provision(runtime)).status).toBe(200);
    const creator = await admitPlayer(peer, runtime, 'a');
    expect((await syncView(creator)).snapshot.board).toEqual(captured);
    peer.rulesets.delete('ruleset-one');
    creator.send({ type: 'history', step: 0 });
    const history = await eventually(
      () => creator.messages.find((m) => m.type === 'history'),
      'retained board in history'
    );
    expect(history.snapshot.board).toEqual(captured);
    expect(JSON.parse((await runtime.exec('SELECT data FROM current_state WHERE id=1'))[0].data).board).toBeUndefined();
    await runtime.restart();
    expect((await syncView(await admitPlayer(peer, runtime, 'a'))).snapshot.board).toEqual(captured);
  });

  it('opens with the last turn its creator chose', async () => {
    const card = cardPage('card-one');
    const [treachery, spice] = [deckPage('treachery-deck', [card]), deckPage('spice-deck', [card], 5)];
    seedRuleset([card, treachery, spice], [slot('treachery', treachery), slot('spice', spice)]);
    peer.game = { ...peer.game, lastTurn: 6 };

    expect((await provision(runtime)).status).toBe(200);
    expect((await syncView(await admitPlayer(peer, runtime, 'a'))).snapshot.lastTurn).toBe(6);
  });

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

    /* Every delivered control belongs to play; drafting refuses phase steps and readiness alike. */
    for (const action of [
      { kind: 'phase', direction: 1 },
      { kind: 'ready', ready: true },
    ]) {
      const { reply } = await sendCommand(creator, action);
      expect(reply).toMatchObject({ type: 'rejected', message: 'The game has not started playing yet.' });
    }
    expect(view.snapshot.table.events.map((event) => event.message)).toEqual([
      'Table ready. Drafting.',
      'Seat 1 is taken by the creator.',
    ]);

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
