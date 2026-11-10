import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { clientMessageSchema } from '../../src/shared/play/protocol';
import { dealt, draftingRuntime } from './native-drafting.fixture.ts';
import type { NativeConnection, NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import {
  accepted,
  admitPlayer,
  eventually,
  readHistoricalSnapshot,
  required,
  syncView,
} from './native-runtime.fixture.ts';

/* Keep directory retry alarms beyond the real clock during each test. */
const ROOM_CLOCK_AHEAD_MS = 60_000;

/* All HTTP calls end at the synthetic Convex peer; these tests never contact Discord. */
describe('Explicit Discord nudges', () => {
  let runtime: NativeRuntime, peer: NativePeer, players: NativeConnection[];
  let swappingSnapshot: string;
  beforeEach(async () => {
    ({ runtime, peer } = await draftingRuntime([], undefined, {
      prepare: (peer) => {
        peer.game!.discordVoice = true;
      },
    }));
    players = await dealt(runtime);
    const [swapping] = await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1');
    swappingSnapshot = swapping.data;
    for (const player of players) {
      const view = await syncView(player);
      await accepted(player, {
        kind: 'swap-ready',
        ready: true,
        round: required(view.snapshot.swapping).round,
        seat: view.viewer.viewerSeat,
      });
    }
    await eventually(
      async () => (await runtime.exec('SELECT pending FROM directory_outbox'))[0]?.pending === 0,
      'settled setup directory'
    );
    await runtime.clock(ROOM_CLOCK_AHEAD_MS);
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  async function send(
    text: string,
    {
      sender = players[0],
      table = false,
      requestId = randomUUID(),
    }: { sender?: NativeConnection; table?: boolean; requestId?: string } = {}
  ) {
    const own = await syncView(sender);
    const roster = required(own.snapshot.roster);
    const from = required(roster.seats.find((seat) => seat.id === own.viewer.viewerSeat)?.faction);
    const to = required(roster.seats.find((seat) => seat.id !== own.viewer.viewerSeat)?.faction);
    const offset = sender.messages.length;
    sender.send(
      clientMessageSchema.parse({
        type: 'conversation-send',
        factionId: from.id,
        peerId: table ? '@table' : to.id,
        requestId,
        text,
      })
    );
    return eventually(
      () =>
        sender.messages
          .slice(offset)
          .find(
            (message) =>
              (message.type === 'conversation-message' && message.message.requestId === requestId) ||
              (message.type === 'rejected' && message.requestId === requestId)
          ),
      'saved message'
    );
  }
  async function targetName() {
    const a = await syncView(players[0]);
    return required(required(a.snapshot.roster).seats.find((seat) => seat.id !== a.viewer.viewerSeat)?.faction).name;
  }
  async function restart() {
    await runtime.restart();
    /* A fresh isolate resets its module clock, while the stored deadlines stay a minute ahead. */
    await runtime.clock(ROOM_CLOCK_AHEAD_MS);
  }
  async function nudge(sender = players[0], toSeat = 'seat-2', requestId = randomUUID()) {
    sender.send({ type: 'nudge', requestId, toSeat });
    await syncView(sender);
    return requestId;
  }
  async function refusedNudge(sender = players[0], toSeat = 'seat-2') {
    const requestId = await nudge(sender, toSeat);
    const refusal = await eventually(
      () => sender.messages.find((message) => message.type === 'rejected' && message.requestId === requestId),
      'refused nudge'
    );
    expect(peer.nudges).toEqual([]);
    return refusal;
  }

  it('keeps names, mentions and slash commands as ordinary faction and table chat', async () => {
    const faction = await targetName();
    for (const table of [false, true]) {
      for (const text of ['Synthetic B', faction, `@${faction.toUpperCase()}`, '/nudge Synthetic B']) {
        expect(await send(text, { table })).toMatchObject({ type: 'conversation-message', message: { text } });
      }
    }
    expect(peer.nudges).toEqual([]);
    await restart();
    expect(peer.nudges).toEqual([]);
  });

  it('derives seat identities server-side without saving chat or replaying the request after restart', async () => {
    const before = await runtime.exec('SELECT * FROM conversation_messages');
    await nudge();
    await eventually(() => peer.nudges.length === 1, 'nudge delivery');
    expect(peer.nudges[0]).toEqual({
      gameId: 'fixture-game',
      secret: 'a'.repeat(64),
      fromSeat: 'seat-1',
      fromUserId: 'user-a',
      fromFactionId: expect.any(String),
      toSeat: 'seat-2',
      toUserId: 'user-b',
    });
    expect(await runtime.exec('SELECT * FROM conversation_messages')).toEqual(before);
    await restart();
    players = [await admitPlayer(runtime, 'a'), await admitPlayer(runtime, 'b')];
    await runtime.alarm(true);
    expect(peer.nudges).toHaveLength(1);
    /* New explicit requests reach Convex, which owns the recipient cooldown. */
    await nudge();
    await eventually(() => peer.nudges.length === 2, 'new explicit nudge');
  });

  it.each(['error', 'missing'] as const)('drops a %s delivery without queueing or retrying', async (mode) => {
    peer.directoryMode = 'error';
    peer.nudgeMode = mode;
    await runtime.exec('UPDATE directory_outbox SET pending=1, retry_at=0');
    await nudge();
    await eventually(() => peer.nudges.length === 1, 'single nudge attempt');
    expect(peer.requests.find((request) => request.function === 'playDiscordNudges:sendNudge')?.path).toBe(
      '/api/action'
    );
    expect(await send('Synthetic B')).toMatchObject({ type: 'conversation-message', message: { text: 'Synthetic B' } });
    await restart();
    await runtime.clock(ROOM_CLOCK_AHEAD_MS + 30_000);
    await runtime.alarm(true);
    expect(peer.nudges).toHaveLength(1);
  });

  it('refuses spectators, self targets and unknown seats', async () => {
    const spectator = await admitPlayer(runtime, 'c');
    expect(await refusedNudge(spectator)).toMatchObject({ type: 'rejected' });
    expect(await refusedNudge(players[0], 'seat-1')).toMatchObject({ type: 'rejected' });
    expect(await refusedNudge(players[0], 'unknown-seat')).toMatchObject({ type: 'rejected' });
  });

  it('refuses a target whose player has left and a sender who no longer holds a seat', async () => {
    await accepted(players[1], { kind: 'seat-depart' });
    expect(await refusedNudge(players[0])).toMatchObject({ type: 'rejected' });
    expect(await refusedNudge(players[1], 'seat-1')).toMatchObject({ type: 'rejected' });
  });

  it('refuses a sender whose seat has no faction', async () => {
    await runtime.exec("UPDATE seats SET faction_id=NULL, faction_name=NULL, faction_color=NULL WHERE seat='seat-1'");
    await restart();
    players = [await admitPlayer(runtime, 'a'), await admitPlayer(runtime, 'b')];
    expect(await refusedNudge()).toMatchObject({ type: 'rejected' });
  });

  it('refuses games without Discord voice', async () => {
    await runtime.exec("UPDATE metadata SET data=json_set(data, '$.game.discordVoice', json('false')) WHERE id=1");
    await restart();
    players = [await admitPlayer(runtime, 'a'), await admitPlayer(runtime, 'b')];
    expect(await refusedNudge()).toMatchObject({ type: 'rejected' });
  });

  it.each(['drafting', 'swapping', 'finished', 'discarded'] as const)('refuses nudges during %s', async (stage) => {
    const [row] = await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1');
    const snapshot = readHistoricalSnapshot(stage === 'swapping' ? swappingSnapshot : row.data);
    snapshot.stage = stage;
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(snapshot)]);
    await restart();
    players = [await admitPlayer(runtime, 'a'), await admitPlayer(runtime, 'b')];
    expect(await refusedNudge()).toMatchObject({ type: 'rejected' });
  });

  it('refuses nudges during Mentat recall', async () => {
    await accepted(players[0], { kind: 'ready', ready: true });
    const view = await syncView(players[0]);
    const step = required(required(view.snapshot.reviewCheckpoints).at(-1)).step;
    const review = required((await accepted(players[0], { kind: 'review-propose', step })).snapshot.review);
    const recalled = await accepted(players[1], { kind: 'review-ballot', reviewId: review.id, choice: 'review' });
    expect(required(recalled.snapshot.review).startedAt).not.toBeNull();
    expect(await refusedNudge()).toMatchObject({ type: 'rejected' });
  });

  it('charges explicit nudges to the smaller command bucket and rejects their request IDs', async () => {
    await runtime.clock(ROOM_CLOCK_AHEAD_MS + 10_000);
    for (let index = 0; index < 40; index++) {
      players[0].send({ type: 'nudge', requestId: `nudge-burst-${index}`, toSeat: 'seat-2' });
    }
    await syncView(players[0]);
    const refused = players[0].messages.filter(
      (message) => message.type === 'rejected' && message.requestId.startsWith('nudge-burst-')
    );
    expect(refused.length).toBeGreaterThanOrEqual(5);
    expect(refused).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'rejected',
          message: 'You are acting too fast. Wait a moment, then try again.',
        }),
      ])
    );
    expect(players[0].closed).toBe(false);
  });

  it('retires old persisted delivery and cooldown tables when a room loads', async () => {
    await runtime.exec('CREATE TABLE nudge_outbox (data TEXT)');
    await runtime.exec("INSERT INTO nudge_outbox VALUES ('legacy-recipient')");
    await runtime.exec('CREATE TABLE nudge_cooldowns (seat TEXT)');
    await restart();
    expect(
      await runtime.exec("SELECT name FROM sqlite_master WHERE name IN ('nudge_outbox','nudge_cooldowns')")
    ).toEqual([]);
    expect(peer.nudges).toEqual([]);
  });
});
