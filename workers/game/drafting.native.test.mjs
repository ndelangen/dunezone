import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assetPublishingFaction } from '../../src/shared/factions/fixtures/assetPublishingFaction';
import { cardPage, deckPage, slot } from './native-catalogue.fixture.mjs';
import {
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  provision,
  sendCommand,
  syncView,
} from './native-runtime.fixture.mjs';

const CREATOR = { userId: 'user-a', displayName: 'Synthetic A', avatarUrl: 'https://dune.zone/user-images/a.jpg' };

/** A faction as the draft catalogue lists it: real render data from the shared fixture, a name of its own. */
function draftable(id, name, { linked = true, published = true } = {}) {
  return {
    id,
    slug: id,
    name,
    logo: assetPublishingFaction.logo,
    background: assetPublishingFaction.background,
    color: assetPublishingFaction.themeColor,
    linked,
    published,
  };
}

/** The same faction as the capture reads it at assignment. */
function definition(id, name) {
  return {
    faction: { id, slug: id, name },
    data: { ...assetPublishingFaction, name },
    token: `/published/faction-tokens/${id}/token.jpg`,
    leaders: assetPublishingFaction.leaders.map((leader) => ({
      memberId: leader.memberId,
      front: `/published/leaders/${id}.${leader.memberId}/leader.jpg`,
    })),
  };
}

describe('Drafting and public assignment on a real game', () => {
  let peer, runtime;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.expiresAt = () => Date.now() + 600_000;
    peer.game = { rulesetId: 'ruleset-one', minimumPlayers: 2, creator: CREATOR };
    /* Faction backs and troops are not generated anywhere yet, so a real game could not deal; the isolated path may. */
    peer.provisional = true;
    const card = cardPage('card-one');
    const [treachery, spice] = [deckPage('treachery-deck', [card]), deckPage('spice-deck', [card], 5)];
    for (const page of [card, treachery, spice]) {
      peer.catalogue.set(`${page.asset.type}/${page.asset.slug}`, page);
    }
    peer.rulesets.set('ruleset-one', {
      ruleset: { id: 'ruleset-one', slug: 'classic', name: 'Classic' },
      slots: [slot('treachery', treachery), slot('spice', spice)],
    });
    peer.draftable = [
      draftable('atreides', 'Atreides'),
      draftable('harkonnen', 'Harkonnen'),
      draftable('fremen', 'Fremen', { linked: false }),
      draftable('ixians', 'Ixians', { published: false }),
    ];
    for (const [id, name] of [
      ['atreides', 'Atreides'],
      ['harkonnen', 'Harkonnen'],
      ['fremen', 'Fremen'],
    ]) {
      peer.factions.set(id, definition(id, name));
    }
    runtime = await createRuntime(peer, 'game');
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The real game did not provision.');
    }
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  async function accepted(connection, action) {
    const { reply } = await sendCommand(connection, action);
    expect(reply.type).not.toBe('rejected');
    return syncView(connection);
  }
  const rejected = async (connection, action) => (await sendCommand(connection, action)).reply.message;
  const ownRequest = (view) => view.snapshot.controls.seatRequests.find((request) => request.own);
  /** Seats a spectator through the creator's approval, and returns the newcomer's view. */
  async function seat(newcomer, approver) {
    const requested = await accepted(newcomer, { kind: 'seat-request' });
    await accepted(approver, { kind: 'seat-approve', requestId: ownRequest(requested).id });
    return syncView(newcomer);
  }
  const stage = async (connection) => (await syncView(connection)).snapshot.stage;

  it('lists the catalogue from creation, keeps picks and bans by seat, strips a banned pick everywhere and clears readiness on any change', async () => {
    const a = await admit('a');
    const opening = await syncView(a);
    expect(opening.snapshot.draft.factions.map((faction) => faction.id)).toEqual([
      'atreides',
      'harkonnen',
      'fremen',
      'ixians',
    ]);
    expect(opening.snapshot.controls.players).toEqual([
      { seat: 'seat-1', name: 'Synthetic A', avatar: 'https://dune.zone/user-images/a.jpg' },
    ]);
    const b = await admit('b');
    expect(await rejected(b, { kind: 'draft-pick', factionId: 'atreides' })).toBe('Only a seated player drafts.');
    await seat(b, a);

    let view = await accepted(a, { kind: 'draft-pick', factionId: 'atreides' });
    expect(view.snapshot.draft.picks).toEqual({ 'seat-1': ['atreides'] });
    expect(await rejected(a, { kind: 'draft-pick', factionId: 'ixians' })).toBe(
      'Ixians is not generated yet; its assets are not published.'
    );
    await accepted(a, { kind: 'draft-ready', ready: true });
    view = await accepted(b, { kind: 'draft-ban', factionId: 'atreides' });
    expect(view.snapshot.draft.picks).toEqual({ 'seat-1': [] });
    expect(view.snapshot.draft.bans).toEqual({ 'seat-2': ['atreides'] });
    /* The ban invalidated A's readiness, offline or not. */
    expect(view.snapshot.draft.ready).toEqual([]);
    expect(await rejected(a, { kind: 'draft-pick', factionId: 'atreides' })).toBe(
      'Atreides is banned; every ban on it has to go first.'
    );
    view = await accepted(b, { kind: 'draft-unban', factionId: 'atreides' });
    /* Lifting the last ban restores no pick. */
    expect(view.snapshot.draft.picks).toEqual({ 'seat-1': [] });
    expect(view.snapshot.table.events[0].message).toBe('Synthetic B lifted the ban on Atreides.');
    expect(await stage(a)).toBe('drafting');
  });

  it('deals seats by itself once the roster meets the minimum, everyone is ready and the pool suffices, and never again', async () => {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    /* One off-ruleset pick and one linked faction to fill from; Harkonnen is the only linked faction left unbanned. */
    await accepted(a, { kind: 'draft-pick', factionId: 'fremen' });
    await accepted(b, { kind: 'draft-ban', factionId: 'atreides' });
    await accepted(a, { kind: 'draft-ready', ready: true });
    expect(await stage(a)).toBe('drafting');
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await stage(a)) === 'swapping', 'public assignment');

    const dealt = await syncView(b);
    expect(dealt.snapshot.draft).toBeUndefined();
    expect(dealt.snapshot.roster.seatCount).toBe(2);
    const factions = dealt.snapshot.roster.seats.map((seat) => seat.faction?.id).sort();
    expect(factions).toEqual(['fremen', 'harkonnen']);
    expect(dealt.snapshot.roster.seats.map((seat) => seat.position).sort()).toEqual([0, 1]);
    expect(dealt.snapshot.roster.seats.every((seat) => seat.faction?.color === assetPublishingFaction.themeColor)).toBe(
      true
    );
    /* Each player now controls the faction their seat carries: a private projection per faction. */
    expect(dealt.snapshot.bank.factionId).toBe(
      dealt.snapshot.roster.seats.find((seat) => seat.id === 'seat-2').faction.id
    );
    expect(dealt.snapshot.table.events[0].message).toBe('Seats dealt: 2 players, trading opens.');
    expect((await runtime.captures()).factions.map((capture) => capture.faction.id).sort()).toEqual([
      'fremen',
      'harkonnen',
    ]);
    await eventually(
      () =>
        peer.summaries.at(-1)?.summary.stage === 'swapping' &&
        peer.summaries.at(-1).summary.seats.every((seat) => seat.faction),
      'swapping summary with factions'
    );
    /* Drafting is over: its commands are refused, a later request cannot add a seat, and a restart keeps the deal. */
    expect(await rejected(a, { kind: 'draft-ready', ready: false })).toBe('Drafting has ended for this game.');
    const c = await admit('c');
    expect(await rejected(c, { kind: 'seat-request' })).toBe('Choose an open seat.');
    await runtime.restart();
    const restored = await syncView(await admit('a'));
    expect(restored.snapshot.stage).toBe('swapping');
    expect(restored.snapshot.roster.seats.map((seat) => seat.faction?.id).sort()).toEqual(['fremen', 'harkonnen']);
    expect(await runtime.exec("SELECT COUNT(*) AS count FROM captures WHERE kind='faction'")).toEqual([{ count: 2 }]);
  });

  const events = (view) => view.snapshot.table.events.map((event) => event.message);
  const deleteAccount = (userId) =>
    runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: 'fixture-game',
        secret: 'a'.repeat(64),
        userId,
        eventId: `deletion-${userId}`,
        deletionOperationId: `operation-${userId}`,
      }),
    });
  /** Seats two players with one pick each and readies both, so the deal is one capture away. */
  async function readyPair() {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await accepted(a, { kind: 'draft-pick', factionId: 'atreides' });
    await accepted(b, { kind: 'draft-pick', factionId: 'harkonnen' });
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(b, { kind: 'draft-ready', ready: true });
    return { a, b };
  }

  it('rebuilds the draft and assignment events of a deleted account through restore', async () => {
    const { a } = await readyPair();
    await eventually(async () => (await stage(a)) === 'swapping', 'public assignment');
    expect((await deleteAccount('user-b')).status).toBe(200);
    const scrubbed = events(await syncView(a));
    expect(scrubbed).toContain('[deleted user] drafted Harkonnen.');
    /* The pool is dealt at random, so seat 2 plays either faction. */
    expect(
      scrubbed.some((message) =>
        /^\[deleted user\] plays (Atreides|Harkonnen) from seat 2 at station \d\.$/.test(message)
      )
    ).toBe(true);
    expect(scrubbed).toContain('Synthetic A drafted Atreides.');
    expect(scrubbed.some((message) => message.includes('Synthetic B'))).toBe(false);
    expect(await runtime.exec("SELECT user_id, display_name FROM draft_history WHERE seat='seat-2'")).toEqual(
      Array(3).fill({ user_id: null, display_name: '[deleted user]' })
    );
    await runtime.restart();
    const restored = events(await syncView(await admit('a')));
    expect(restored.some((message) => message.includes('Synthetic B'))).toBe(false);
    expect(restored).toContain('[deleted user] drafted Harkonnen.');
  });

  it('still deals when a player presses Ready again while the captures run, and reports a capture that errors', async () => {
    peer.factionMode = 'hold';
    const { a, b } = await readyPair();
    const held = () => peer.requests.filter((r) => r.function === 'playCatalogue:factionDefinition' && !r.completedAt);
    await eventually(() => held().length > 0, 'a capture held open');
    /* Readiness re-sent mid-attempt reorders nothing the deal depends on. */
    await accepted(b, { kind: 'draft-ready', ready: true });
    peer.factionMode = 'allow';
    for (const record of held()) {
      record.release(peer.factions.get(record.args.factionId));
    }
    await eventually(async () => (await stage(a)) === 'swapping', 'deal after the re-press');
    expect((await syncView(a)).snapshot.roster.seats.map((seat) => seat.faction?.id).sort()).toEqual([
      'atreides',
      'harkonnen',
    ]);
  });

  it('leaves a reason when the capture itself errors, and a retry deals without a second readiness round', async () => {
    peer.factionMode = 'error';
    const { a, b } = await readyPair();
    await eventually(async () => (await syncView(a)).snapshot.draft?.failure !== null, 'failure recorded');
    expect((await syncView(a)).snapshot.draft.failure).toBe('The deal did not go through. Try again.');
    peer.factionMode = 'allow';
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await stage(a)) === 'swapping', 'deal after the retry');
  });

  it('stays in drafting with the reason when a dealt faction cannot be captured, and deals once it can', async () => {
    peer.factions.delete('fremen');
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await accepted(a, { kind: 'draft-pick', factionId: 'fremen' });
    await accepted(a, { kind: 'draft-pick', factionId: 'harkonnen' });
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await syncView(a)).snapshot.draft?.failure !== null, 'failure recorded');
    const failed = await syncView(a);
    expect(failed.snapshot.stage).toBe('drafting');
    expect(failed.snapshot.draft.failure).toBe('This faction is not available.');
    expect(failed.snapshot.draft.ready.sort()).toEqual(['seat-1', 'seat-2']);
    expect(failed.snapshot.roster.seats.every((seat) => seat.faction === null)).toBe(true);
    /* A technical retry rechecks the gates without a second readiness round. */
    peer.factions.set('fremen', definition('fremen', 'Fremen'));
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await stage(a)) === 'swapping', 'assignment after the retry');
  });

  it("clears readiness on a roster change, drops a departing player's lists, and reads the catalogue again when stale", async () => {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await accepted(b, { kind: 'draft-pick', factionId: 'harkonnen' });
    await accepted(a, { kind: 'draft-ready', ready: true });
    const c = await admit('c');
    const joined = await seat(c, a);
    expect(joined.snapshot.draft.ready).toEqual([]);
    expect(joined.snapshot.draft.picks).toEqual({ 'seat-2': ['harkonnen'] });
    const left = await accepted(b, { kind: 'seat-depart' });
    expect(left.snapshot.draft.picks).toEqual({});
    expect(left.snapshot.roster.seats.map((seat) => seat.id).sort()).toEqual(['seat-1', 'seat-3']);

    peer.draftable = [...peer.draftable, draftable('emperor', 'Emperor')];
    await runtime.clock(60_000);
    await accepted(a, { kind: 'draft-pick', factionId: 'atreides' });
    await eventually(
      async () => (await syncView(a)).snapshot.draft.factions.some((faction) => faction.id === 'emperor'),
      'catalogue refreshed'
    );
    const refreshed = await syncView(a);
    expect(refreshed.snapshot.draft.picks).toEqual({ 'seat-1': ['atreides'] });
    await runtime.restart();
    expect((await syncView(await admit('a'))).snapshot.draft.factions.map((faction) => faction.id)).toContain(
      'emperor'
    );
  });
});
