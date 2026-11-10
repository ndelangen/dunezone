import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { clientMessageSchema } from '../../src/shared/play/protocol';
import { dealt, draftingRuntime } from './native-drafting.fixture.ts';
import type { NativeConnection, NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import { accepted, admitPlayer, eventually, required, syncView } from './native-runtime.fixture.ts';

/* Keep directory retry alarms beyond the real clock during each test. */
const ROOM_CLOCK_AHEAD_MS = 60_000;

/* All HTTP calls end at the synthetic Convex peer; these tests never contact Discord. */
describe('Committed conversation nudges', () => {
  let runtime: NativeRuntime, peer: NativePeer, players: NativeConnection[];
  beforeEach(async () => {
    ({ runtime, peer } = await draftingRuntime([], undefined, {
      prepare: (peer) => {
        peer.game!.discordVoice = true;
      },
    }));
    players = await dealt(runtime);
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
  it('saves chat and sends only seat references once across duplicate requests and restart', async () => {
    const text = `@${(await targetName()).toUpperCase()}`;
    const reply = await send(text, { requestId: 'same-id' });
    expect(reply).toMatchObject({ type: 'conversation-message', message: { text } });
    await eventually(() => peer.nudges.length === 1, 'nudge delivery');
    expect(peer.nudges[0]).toEqual({
      directorySequence: expect.any(Number),
      gameId: 'fixture-game',
      secret: 'a'.repeat(64),
      fromSeat: 'seat-1',
      toSeat: 'seat-2',
    });
    await send(text, { requestId: 'same-id' });
    await restart();
    players = [await admitPlayer(runtime, 'a'), await admitPlayer(runtime, 'b')];
    await send(text, { requestId: 'same-id' });
    expect(peer.nudges).toHaveLength(1);
    /* The sole cooldown lives in Convex, so a new chat message makes a fresh best-effort request. */
    await send(text);
    await eventually(() => peer.nudges.length === 2, 'new message nudge');
  });

  it('does not wait for directory publication or retry failed transport', async () => {
    peer.directoryMode = 'error';
    peer.nudgeMode = 'error';
    await runtime.exec('UPDATE directory_outbox SET pending=1, retry_at=0');
    expect(await send('Synthetic B')).toMatchObject({ type: 'conversation-message' });
    await eventually(() => peer.nudges.length === 1, 'single nudge attempt');
    await restart();
    await runtime.clock(ROOM_CLOCK_AHEAD_MS + 30_000);
    await runtime.alarm(true);
    expect(peer.nudges).toHaveLength(1);
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

  it('ignores ordinary text, self names, ambiguous names and disabled games', async () => {
    await send('Hello Synthetic B');
    await send('Synthetic A');
    await runtime.exec("UPDATE actors SET display_name='Synthetic A' WHERE user_id='user-b'");
    await send('Synthetic A', { table: true });
    expect(peer.nudges).toEqual([]);
    await runtime.exec("UPDATE metadata SET data=json_set(data, '$.game.discordVoice', json('false')) WHERE id=1");
    await restart();
    players = [await admitPlayer(runtime, 'a'), await admitPlayer(runtime, 'b')];
    await send(await targetName());
    expect(peer.nudges).toEqual([]);
  });
});
