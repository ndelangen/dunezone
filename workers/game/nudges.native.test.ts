import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { PLAY_NUDGE_COOLDOWN_MS, PLAY_NUDGE_MAX_AGE_MS } from '../../src/shared/play/nudges';
import { clientMessageSchema } from '../../src/shared/play/protocol';
import { dealt, draftingRuntime } from './native-drafting.fixture.ts';
import type { NativeConnection, NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import { accepted, admitPlayer, eventually, required, syncView } from './native-runtime.fixture.ts';

/* Keep retry alarms beyond the real clock; only tick() fires them during each test. */
const ROOM_CLOCK_AHEAD_MS = 60_000;

/* All HTTP calls end at the synthetic Convex peer; these tests never contact Discord. */
describe('Committed conversation nudges', () => {
  let runtime: NativeRuntime, peer: NativePeer, players: NativeConnection[];
  beforeEach(async () => {
    ({ runtime, peer } = await draftingRuntime());
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
  const pending = () => runtime.exec('SELECT * FROM nudge_outbox');
  async function targetName() {
    const a = await syncView(players[0]);
    return required(required(a.snapshot.roster).seats.find((seat) => seat.id !== a.viewer.viewerSeat)?.faction).name;
  }
  async function restart() {
    await runtime.restart();
    /* A fresh isolate resets its module clock, while the stored deadlines stay a minute ahead. */
    await runtime.clock(ROOM_CLOCK_AHEAD_MS);
  }
  async function tick(offset: number) {
    await runtime.clock(ROOM_CLOCK_AHEAD_MS + offset);
    await runtime.alarm(true);
  }

  it('keeps exact chat text and sends only identifiers and the public sender faction once across duplicates and restart', async () => {
    const name = await targetName();
    const text = `@${name.toUpperCase()}`;
    const reply = await send(text, { requestId: 'same-id' });
    expect(reply).toMatchObject({ type: 'conversation-message', message: { text } });
    await eventually(() => peer.nudges.length === 1, 'nudge delivery');
    expect(peer.nudges[0]).toMatchObject({ gameId: 'fixture-game', toUserId: 'user-b', toSeat: 'seat-2' });
    expect(Object.keys(peer.nudges[0]).sort()).toEqual([
      'at',
      'fromFactionId',
      'fromFactionName',
      'gameId',
      'nudgeId',
      'secret',
      'toSeat',
      'toUserId',
    ]);
    await send(text, { requestId: 'same-id' });
    await send(`/nudge ${name}`, { table: true });
    await restart();
    players = [await admitPlayer(runtime, 'a'), await admitPlayer(runtime, 'b')];
    await send(name);
    expect(peer.nudges).toHaveLength(1);
    expect(await pending()).toEqual([]);
    await tick(PLAY_NUDGE_COOLDOWN_MS + 1000);
    await send(name);
    await eventually(() => peer.nudges.length === 2, 'new cooldown window');
  });

  it('waits for the current directory summary before publishing the nudge', async () => {
    peer.directoryMode = 'error';
    await runtime.exec('UPDATE directory_outbox SET pending=1, retry_at=0');
    await send('Synthetic B');
    await eventually(async () => (await pending())[0]?.attempts === 1, 'directory retry');
    expect(peer.nudges).toEqual([]);
    peer.directoryMode = 'ack';
    await tick(2000);
    await eventually(() => peer.nudges.length === 1, 'nudge after directory recovery');
    await eventually(async () => (await pending()).length === 0, 'nudge acknowledged');
  });

  it('rolls chat, cooldown and outbox back together if staging fails', async () => {
    await runtime.exec(
      "CREATE TRIGGER refuse_nudge BEFORE INSERT ON nudge_outbox BEGIN SELECT RAISE(ABORT,'nudge failure'); END"
    );
    expect(await send(await targetName(), { requestId: 'retry' })).toMatchObject({ type: 'rejected' });
    expect(await runtime.exec('SELECT * FROM conversation_messages')).toEqual([]);
    expect(await runtime.exec('SELECT * FROM nudge_cooldowns')).toEqual([]);
    expect(peer.nudges).toEqual([]);
    await runtime.exec('DROP TRIGGER refuse_nudge');
    await send(await targetName(), { requestId: 'retry' });
    await eventually(() => peer.nudges.length === 1, 'retried saved nudge');
  });

  it('retries transport failures after restart with the same id and stops on refusal', async () => {
    peer.nudgeMode = 'error';
    await send('Synthetic B');
    await eventually(async () => (await pending())[0]?.attempts === 1, 'deferred nudge');
    const id = peer.nudges[0].nudgeId;
    peer.nudgeMode = 'refuse';
    await restart();
    await tick(2000);
    await eventually(async () => (await pending()).length === 0, 'terminal refusal');
    expect(peer.nudges.map((entry) => entry.nudgeId)).toEqual([id, id]);
    await tick(10_000);
    expect(peer.nudges).toHaveLength(2);
  });

  it('drops expired events and events whose target left without pinging their replacement', async () => {
    peer.nudgeMode = 'error';
    await send(await targetName());
    await eventually(async () => (await pending())[0]?.attempts === 1, 'deferred nudge');
    await runtime.exec("UPDATE actors SET user_id='replacement' WHERE user_id='user-b'");
    await tick(2000);
    await eventually(async () => (await pending()).length === 0, 'stale occupant removed');
    expect(peer.nudges).toHaveLength(1);
    await runtime.exec("UPDATE actors SET user_id='user-b' WHERE user_id='replacement'");
    await runtime.exec('DELETE FROM nudge_cooldowns');
    await send('Synthetic B');
    await eventually(async () => (await pending())[0]?.attempts === 1, 'second deferred nudge');
    await tick(PLAY_NUDGE_MAX_AGE_MS + 5000);
    await eventually(async () => (await pending()).length === 0, 'expired nudge removed');
    expect(peer.nudges).toHaveLength(2);
  });

  it('stops after bounded transport attempts without leaving a nudge alarm', async () => {
    peer.nudgeMode = 'error';
    await send('Synthetic B');
    await eventually(async () => (await pending())[0]?.attempts === 1, 'first failure');
    for (const [offset, attempts] of [
      [2000, 2],
      [5000, 3],
      [10_000, 4],
    ]) {
      await tick(offset);
      await eventually(() => peer.nudges.length === attempts, 'bounded retry');
      if (attempts < 4) {
        await eventually(async () => (await pending())[0]?.attempts === attempts, 'retry saved');
      }
    }
    await eventually(async () => (await pending()).length === 0, 'attempt limit');
    await tick(30_000);
    expect(peer.nudges).toHaveLength(4);
  });

  it('drops queued nudges when the game ends and does not stage new ones', async () => {
    peer.nudgeMode = 'error';
    await send('Synthetic B');
    await eventually(async () => (await pending())[0]?.attempts === 1, 'first failure');
    await runtime.exec("UPDATE current_state SET data=json_set(data, '$.stage', 'finished') WHERE id=1");
    await restart();
    players = [await admitPlayer(runtime, 'a'), await admitPlayer(runtime, 'b')];
    expect(await pending()).toEqual([]);
    await send('Synthetic B');
    expect(await pending()).toEqual([]);
    expect(peer.nudges).toHaveLength(1);
  });

  it('scrubs pending recipient identity during account deletion', async () => {
    peer.nudgeMode = 'error';
    await send('Synthetic B');
    await eventually(async () => (await pending())[0]?.attempts === 1, 'deferred nudge');
    const response = await runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: 'fixture-game',
        secret: 'a'.repeat(64),
        userId: 'user-b',
        eventId: 'delete-b',
        deletionOperationId: 'operation-b',
      }),
    });
    expect(response.status).toBe(200);
    expect(await pending()).toEqual([]);
    await tick(2000);
    expect(peer.nudges).toHaveLength(1);
  });

  it('ignores ordinary text, self names, ambiguous names and disabled games', async () => {
    await send('Hello Synthetic B');
    await send('Synthetic A');
    await runtime.exec("UPDATE actors SET display_name='Synthetic A' WHERE user_id='user-b'");
    await send('Synthetic A', { table: true });
    expect(await pending()).toEqual([]);
    expect(peer.nudges).toEqual([]);
    await runtime.exec("UPDATE metadata SET data=json_set(data, '$.game.discordVoice', json('false')) WHERE id=1");
    await restart();
    players = [await admitPlayer(runtime, 'a'), await admitPlayer(runtime, 'b')];
    await send(await targetName());
    expect(await pending()).toEqual([]);
    expect(peer.nudges).toEqual([]);
  });
});
