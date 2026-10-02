import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assetPublishingFaction } from '../../src/shared/factions/fixtures/assetPublishingFaction';
import { draftingRuntime, draftable, definition } from './native-drafting.fixture.mjs';
import {
  accepted,
  admitPlayer,
  createRuntime,
  eventually,
  provision,
  seat,
  sendCommand,
  stage,
  storedEventMessages,
  syncView,
} from './native-runtime.fixture.mjs';

/** A definition a real game deals: every face published, and the fighting troop face carries authored values. */
function ready(id, name) {
  const base = definition(id, name);
  const troops = base.data.troops.map((troop) => ({ ...troop, combat: { strength: 1, fundedStrength: 1 } }));
  return {
    ...base,
    data: { ...base.data, troops },
    cardbacks: {
      traitor: '/published/cardback-presets/traitor/cardback.jpg',
      alliance: '/published/cardback-presets/alliance/cardback.jpg',
    },
    troops: troops.map((troop) => ({
      troopId: troop.troopId,
      front: `/published/faction-troops/${id}.${troop.troopId}/troop.jpg`,
      back: null,
    })),
    traitors: base.data.leaders.map((leader) => ({
      memberId: leader.memberId,
      front: `/published/traitor-cards/${id}.${leader.memberId}/card.jpg`,
    })),
    alliance: `/published/alliance-cards/${id}/card.jpg`,
  };
}

describe('Drafting and public assignment on a real game', () => {
  let peer, runtime, offset;
  beforeEach(async () => {
    offset = 0;
    ({ peer, runtime } = await draftingRuntime());
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  const rejected = async (connection, action) => (await sendCommand(connection, action)).reply.message;

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
      { seat: 'seat-1', name: 'Synthetic A', avatar: 'https://dune.zone/user-images/a.jpg', slug: 'synthetic-a' },
    ]);
    const b = await admit('b');
    expect(await rejected(b, { kind: 'draft-pick', factionId: 'atreides' })).toBe('Only a seated player drafts.');
    await seat(b, a);

    let view = await accepted(a, { kind: 'draft-pick', factionId: 'atreides' });
    expect(view.snapshot.draft.picks).toEqual({ 'seat-1': ['atreides'] });
    /* A player seated after admission is cited by the profile slug their ticket carried. */
    expect(view.snapshot.controls.players.map((player) => player.slug)).toEqual(['synthetic-a', 'synthetic-b']);
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
    expect(view.snapshot.table.events[0].message).toBe('Seat 2 lifted the ban on Atreides.');
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

  it('keeps live and restored station counts unchanged when assignment persistence fails', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const c = await admit('c');
    await seat(b, a);
    await seat(c, a);
    await accepted(b, { kind: 'seat-depart' });
    await accepted(a, { kind: 'draft-pick', factionId: 'atreides' });
    await accepted(c, { kind: 'draft-pick', factionId: 'harkonnen' });
    const before = (await syncView(a)).snapshot;
    expect(before.roster.seatCount).toBe(3);
    await runtime.exec(
      "CREATE TRIGGER fail_assignment BEFORE UPDATE ON current_state WHEN json_extract(NEW.data, '$.stage') = 'swapping' BEGIN SELECT RAISE(ABORT, 'Assignment persistence failure'); END"
    );
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(c, { kind: 'draft-ready', ready: true });
    await eventually(async () => Boolean((await syncView(a)).snapshot.draft?.failure), 'assignment failure');
    const failed = (await syncView(a)).snapshot;
    expect(failed.stage).toBe('drafting');
    expect(failed.roster).toEqual(before.roster);
    expect(await runtime.exec("SELECT json_extract(data, '$.seatCount') AS count FROM metadata")).toEqual([
      { count: 3 },
    ]);
    await runtime.restart();
    const restored = await admit('a');
    expect((await syncView(restored)).snapshot.roster).toEqual(before.roster);
    await runtime.exec('DROP TRIGGER fail_assignment');
    await accepted(restored, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await stage(restored)) === 'swapping', 'assignment retry');
    expect((await syncView(restored)).snapshot.roster.seatCount).toBe(2);
  });

  it('names seats in the draft and assignment events it stores, and scrubs a deleted creator from the game record', async () => {
    const { a } = await readyPair();
    await eventually(async () => (await stage(a)) === 'swapping', 'public assignment');
    const dealt = events(await syncView(a));
    expect(dealt).toContain('Seat 1 drafted Atreides.');
    expect(dealt).toContain('Seat 2 is ready to be dealt.');
    /* The pool is dealt at random, so seat 2 plays either faction. */
    expect(dealt.some((message) => /^Seat 2 plays (Atreides|Harkonnen) at station \d\.$/.test(message))).toBe(true);
    expect((await storedEventMessages(runtime)).filter((message) => message.includes('Synthetic'))).toEqual([]);
    /* The creator's deletion scrubs the recorded creator, avatar and profile slug included. */
    expect((await deleteAccount('user-a')).status).toBe(200);
    expect(
      await runtime.exec(
        "SELECT json_extract(data,'$.game.creator.displayName') AS name, json_extract(data,'$.game.creator.avatarUrl') AS avatar, json_extract(data,'$.game.creator.profileSlug') AS slug FROM metadata"
      )
    ).toEqual([{ name: '[deleted user]', avatar: null, slug: null }]);
    expect(await runtime.exec("SELECT avatar_url, profile_slug FROM actors WHERE user_id='user-a'")).toEqual([
      { avatar_url: null, profile_slug: null },
    ]);
  });

  it('opens without a catalogue when the read fails at creation, and reads it again before the first pick can stand', async () => {
    await runtime.close();
    peer.draftableMode = 'error';
    runtime = await createRuntime(peer, 'game');
    expect((await provision(runtime)).status).toBe(200);
    const a = await admit('a');
    expect((await syncView(a)).snapshot.draft.factions).toEqual([]);
    peer.draftableMode = 'allow';
    expect(await rejected(a, { kind: 'draft-pick', factionId: 'atreides' })).toBe(
      'That faction is not in the catalogue this game reads.'
    );
    await eventually(async () => (await syncView(a)).snapshot.draft.factions.length === 4, 'catalogue read again');
    const view = await accepted(a, { kind: 'draft-pick', factionId: 'atreides' });
    expect(view.snapshot.draft.picks).toEqual({ 'seat-1': ['atreides'] });
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
    await eventually(async () => typeof (await syncView(a)).snapshot.draft?.failure === 'string', 'failure recorded');
    expect((await syncView(a)).snapshot.draft.failure).toBe('The deal did not go through. Try again.');
    peer.factionMode = 'allow';
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await stage(a)) === 'swapping', 'deal after the retry');
  });

  /** Moves the room's clock past the catalogue's TTL again and re-sends this player's readiness, which reads the catalogue again. */
  async function refreshCatalogue(connection) {
    offset += 60_000;
    await runtime.clock(offset);
    await accepted(connection, { kind: 'draft-ready', ready: true });
  }
  const setAside = async (connection) => (await syncView(connection)).snapshot.draft.setAside ?? {};

  it('sets aside a drafted faction that cannot be captured, clears readiness, and takes it back once a refresh finds it', async () => {
    peer.factions.delete('fremen');
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await accepted(a, { kind: 'draft-pick', factionId: 'fremen' });
    await accepted(a, { kind: 'draft-pick', factionId: 'harkonnen' });
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => typeof (await syncView(a)).snapshot.draft?.failure === 'string', 'failure recorded');
    const failed = await syncView(a);
    expect(failed.snapshot.stage).toBe('drafting');
    expect(failed.snapshot.draft.failure).toBe(
      'Set aside as not ready to deal: Fremen (This faction is not available).'
    );
    expect(failed.snapshot.draft.setAside).toEqual({ fremen: 'This faction is not available.' });
    /* The pool the players readied for changed, so their readiness went with it. */
    expect(failed.snapshot.draft.ready).toEqual([]);
    expect(failed.snapshot.roster.seats.every((seat) => seat.faction === null)).toBe(true);

    /*
     * The catalogue has it again. Setting it aside stamped the copy stale, so the next draft command judges it again at once,
     * even one refused for the set-aside faction itself. The catalogue changes first: a refresh that read it before would
     * leave the copy fresh, and a later Ready would not read it again.
     */
    peer.factions.set('fremen', definition('fremen', 'Fremen'));
    expect(await rejected(b, { kind: 'draft-pick', factionId: 'fremen' })).toBe(
      'Fremen cannot be dealt yet: This faction is not available.'
    );
    await eventually(async () => !('fremen' in (await setAside(a))), 'fremen judged again');
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await stage(a)) === 'swapping', 'assignment once it can be captured');
    const dealt = await syncView(a);
    expect(dealt.snapshot.roster.seats.map((seat) => seat.faction?.id).sort()).toEqual(['fremen', 'harkonnen']);
  });

  /** Closes the fixture's isolated game and provisions a real one from the peer as `prepare` leaves it. */
  async function realGame(prepare) {
    offset = 0;
    await runtime.close();
    runtime = undefined;
    peer.provisional = false;
    prepare();
    runtime = await createRuntime(peer, 'game');
    expect((await provision(runtime)).status).toBe(200);
  }
  /** A ready faction with its first leader's face unpublished. */
  function missingLeaderFace(id, name) {
    const faction = ready(id, name);
    const [unpublished, ...published] = faction.leaders;
    return { ...faction, leaders: [{ ...unpublished, front: null }, ...published] };
  }
  const leaderProblem = `leader ${assetPublishingFaction.leaders[0].name}, This leader has no published face.`;

  it('sets aside a faction whose leader face has not published as soon as a real game drafts it, and deals it once it publishes', async () => {
    await realGame(() => {
      peer.factions.set('harkonnen', ready('harkonnen', 'Harkonnen'));
      peer.factions.set('fremen', missingLeaderFace('fremen', 'Fremen'));
    });
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await accepted(b, { kind: 'draft-pick', factionId: 'harkonnen' });
    await accepted(b, { kind: 'draft-ready', ready: true });
    await accepted(a, { kind: 'draft-pick', factionId: 'fremen' });
    /* The pick is judged before anyone readies again: no deal was tried, so there is no failure to show. */
    await eventually(async () => 'fremen' in (await setAside(a)), 'fremen judged at the pick');
    const failed = await syncView(a);
    expect(failed.snapshot.stage).toBe('drafting');
    expect(failed.snapshot.draft.setAside).toEqual({ fremen: leaderProblem });
    expect(failed.snapshot.draft.failure).toBeNull();
    expect(failed.snapshot.draft.ready).toEqual([]);
    expect(await rejected(b, { kind: 'draft-pick', factionId: 'fremen' })).toBe(
      `Fremen cannot be dealt yet: ${leaderProblem}`
    );
    expect(failed.snapshot.roster.seats.every((seat) => seat.faction === null)).toBe(true);
    expect((await runtime.captures()).factions.map((capture) => capture.faction.id)).not.toContain('fremen');

    /* A refresh before the face publishes keeps it aside with the latest reason. */
    await refreshCatalogue(a);
    await eventually(
      async () => (await syncView(a)).snapshot.draft.catalogueAt > failed.snapshot.draft.catalogueAt,
      'refreshed'
    );
    expect(await setAside(a)).toEqual({ fremen: leaderProblem });

    /* The catalogue publishes the face, and the next refresh deals it. */
    peer.factions.set('fremen', ready('fremen', 'Fremen'));
    await refreshCatalogue(a);
    await eventually(async () => !('fremen' in (await setAside(a))), 'fremen judged ready');
    /* Its return changed the drafted pool, so both players ready again for it. */
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await stage(a)) === 'swapping', 'assignment once published');
    const dealt = await syncView(a);
    expect(dealt.snapshot.roster.seats.map((seat) => seat.faction?.id).sort()).toEqual(['fremen', 'harkonnen']);
    expect((await runtime.captures()).factions.every((capture) => capture.readiness.ready)).toBe(true);
  });

  it('clears readiness when a refresh returns a drafted faction from set-aside, so nobody stays ready for a pool that changed', async () => {
    await realGame(() => {
      peer.factions.set('harkonnen', ready('harkonnen', 'Harkonnen'));
      peer.factions.set('fremen', missingLeaderFace('fremen', 'Fremen'));
    });
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await accepted(b, { kind: 'draft-pick', factionId: 'harkonnen' });
    await accepted(a, { kind: 'draft-pick', factionId: 'fremen' });
    await eventually(async () => 'fremen' in (await setAside(a)), 'fremen judged at the pick');
    await accepted(b, { kind: 'draft-ready', ready: true });
    /* Ready found the copy stale and refreshed it; that refresh lands before Fremen publishes, so it keeps Fremen aside. */
    await eventually(async () => (await syncView(a)).snapshot.draft.catalogueAt > 0, 'the refresh Ready started');
    expect((await syncView(a)).snapshot.draft.ready).toEqual(['seat-2']);

    /* Fremen publishes; the refresh that returns it to the draft changes the pool Seat 2 readied for. */
    peer.factions.set('fremen', ready('fremen', 'Fremen'));
    await refreshCatalogue(a);
    await eventually(async () => !('fremen' in (await setAside(a))), 'fremen judged ready');
    const returned = await syncView(a);
    expect(returned.snapshot.stage).toBe('drafting');
    expect(returned.snapshot.draft.ready).toEqual([]);
  });

  it('judges a pick again when a catalogue refresh lands while its judgement runs', async () => {
    await realGame(() => {
      peer.factions.set('fremen', missingLeaderFace('fremen', 'Fremen'));
    });
    const a = await admit('a');
    const opened = (await syncView(a)).snapshot.draft.catalogueAt;
    /* The catalogue is stale, so the pick both starts a judgement and a refresh. */
    offset += 60_000;
    await runtime.clock(offset);
    peer.factionMode = 'hold';
    await accepted(a, { kind: 'draft-pick', factionId: 'fremen' });
    const held = () => peer.requests.filter((r) => r.function === 'playCatalogue:factionDefinition' && !r.completedAt);
    await eventually(() => held().length > 0, 'the pick judgement held open');
    await eventually(async () => (await syncView(a)).snapshot.draft.catalogueAt > opened, 'refreshed mid-judgement');
    /*
     * The held verdict is stale once it lands, so it is released as ready to prove it is not applied.
     * The pick is judged again on the new catalogue, which still lacks the face, without another command.
     */
    peer.factionMode = 'allow';
    for (const record of held()) {
      record.release(ready('fremen', 'Fremen'));
    }
    await eventually(async () => 'fremen' in (await setAside(a)), 'fremen judged again after the refresh', 3000);
    expect(await setAside(a)).toEqual({ fremen: leaderProblem });
  }, 15_000);

  it('never fills with an unready faction: it is set aside, readiness stands, and the deal fills from what remains', async () => {
    await realGame(() => {
      peer.factions.set('harkonnen', ready('harkonnen', 'Harkonnen'));
      peer.factions.set('atreides', missingLeaderFace('atreides', 'Atreides'));
    });
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    /* Atreides is the only linked faction left to fill with. */
    await accepted(a, { kind: 'draft-pick', factionId: 'harkonnen' });
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => 'atreides' in (await setAside(a)), 'atreides set aside');
    const short = await syncView(a);
    expect(short.snapshot.stage).toBe('drafting');
    expect(short.snapshot.draft.setAside).toEqual({ atreides: leaderProblem });
    /* Nobody drafted it, so nobody's readiness depended on it; the reason still shows while the pool is short. */
    expect(short.snapshot.draft.failure).toBe(
      `Set aside as not ready to deal: Atreides (${leaderProblem.replace(/\.$/, '')}).`
    );
    expect(short.snapshot.draft.ready.sort()).toEqual(['seat-1', 'seat-2']);

    /* A ready faction joins the catalogue, and the refresh deals it without a second readiness round. */
    peer.draftable = [...peer.draftable, draftable('emperor', 'Emperor')];
    peer.factions.set('emperor', ready('emperor', 'Emperor'));
    await refreshCatalogue(a);
    await eventually(async () => (await stage(a)) === 'swapping', 'assignment from what remains');
    const dealt = await syncView(a);
    expect(dealt.snapshot.roster.seats.map((seat) => seat.faction?.id).sort()).toEqual(['emperor', 'harkonnen']);
  });

  it('closes a request for a drafting place at the deal, so it cannot hold up a request for a vacant seat', async () => {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    const watcher = await admit('w');
    await accepted(watcher, { kind: 'seat-request' });
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await stage(a)) === 'swapping', 'assignment');
    expect((await syncView(a)).snapshot.controls.seatRequests).toEqual([]);
    expect(await runtime.exec("SELECT state FROM seat_requests WHERE user_id='user-w'")).toEqual([{ state: 'closed' }]);
    await accepted(b, { kind: 'seat-depart' });
    const asked = await accepted(watcher, { kind: 'seat-request', seat: 'seat-2' });
    const request = asked.snapshot.controls.seatRequests.find((entry) => entry.own);
    expect((await syncView(a)).snapshot.controls.seatRequests).toEqual([
      { id: request.id, requesterName: 'Synthetic W', seat: 'seat-2' },
    ]);
    await accepted(a, { kind: 'seat-approve', requestId: request.id });
    expect((await syncView(watcher)).viewer.viewerSeat).toBe('seat-2');
  });

  it('takes a withdrawal of readiness sent before a seat request, so the deal never goes ahead with a player who withdrew', async () => {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    const watcher = await admit('w');
    const seen = await accepted(a, { kind: 'draft-ready', ready: true });
    /* A spectator's request moves the revision but leaves the draft as A saw it. */
    await accepted(watcher, { kind: 'seat-request' });
    const withdrawn = await sendCommand(a, { kind: 'draft-ready', ready: false }, undefined, seen.snapshot.revision);
    expect(withdrawn.reply.type).not.toBe('rejected');
    await accepted(b, { kind: 'draft-ready', ready: true });
    const view = await syncView(b);
    expect(view.snapshot.stage).toBe('drafting');
    expect(view.snapshot.draft.ready).toEqual(['seat-2']);
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
