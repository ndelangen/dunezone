import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases';
import { draftingRuntime } from './native-drafting.fixture.mjs';
import { accepted, admitPlayer, eventually, seat, sendCommand, syncView } from './native-runtime.fixture.mjs';

const SPECTATOR = 'Spectators can watch but cannot change the table or publish a cursor.';

/* Who may send what on a real game's socket: identity always comes from the connection, never from the message. */
describe('The command path refuses what a connection may not do', { timeout: 60_000 }, () => {
  let peer, runtime, offset;
  beforeEach(async () => {
    ({ peer, runtime } = await draftingRuntime());
    offset = 0;
    for (const id of ['atreides', 'harkonnen']) {
      await runtime.capture('faction', id, { provisional: true });
    }
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  const revision = async (connection) => (await syncView(connection)).snapshot.revision;
  const factionOf = (view) =>
    view.snapshot.roster.seats.find((entry) => entry.id === view.viewer.viewerSeat).faction.id;
  /* The replies a connection received to messages sent since `start`, as type and message. */
  const repliesSince = (connection, start, count) =>
    eventually(() => {
      const replies = connection.messages
        .slice(start)
        .filter((message) => message.type === 'rejected' || message.type === 'carry');
      return replies.length >= count && replies.map((message) => [message.type, message.message]);
    }, `${count} replies`);
  async function stored() {
    const [row] = await runtime.exec('SELECT data FROM current_state');
    return JSON.parse(row.data);
  }

  /* Two players reach play through the draft, trading and setup, then an observer watches. */
  async function inPlay() {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await syncView(a)).snapshot.stage === 'swapping', 'assignment');
    for (const connection of [a, b]) {
      const view = await syncView(connection);
      await accepted(connection, {
        kind: 'swap-ready',
        ready: true,
        round: view.snapshot.swapping.round,
        seat: view.viewer.viewerSeat,
      });
    }
    for (let guard = 0; guard < 12 && (await syncView(a)).snapshot.stage !== 'play'; guard++) {
      if ((await syncView(a)).snapshot.controls.ready.length === 0) {
        await sendCommand(a, { kind: 'ready', ready: true });
        await sendCommand(b, { kind: 'ready', ready: true });
      }
      offset += PHASE_CHANGE_COOLDOWN_MS + 1;
      await runtime.clock(offset);
      await accepted(a, { kind: 'phase', direction: 1 });
    }
    expect((await syncView(a)).snapshot.stage).toBe('play');
    return { a, b, observer: await admit('observer') };
  }

  it('refuses a spectator every table, carry and private command, and a player any other faction’s pieces or conversation', async () => {
    const { a, b, observer } = await inPlay();
    const view = await syncView(a);
    const piece = view.snapshot.table.pieces[0];
    const deck = view.snapshot.table.pieces.find((entry) => entry.items?.length > 1);
    expect(deck).toBeDefined();
    const held = await revision(a);
    for (const action of [
      { kind: 'flip', pieceId: piece.id },
      { kind: 'split', pieceId: deck.id, count: 1 },
      { kind: 'storm', direction: 1 },
      { kind: 'phase', direction: 1 },
      { kind: 'turn', turn: 2 },
      { kind: 'spice-spawn', count: 1 },
      { kind: 'reset' },
      { kind: 'ready', ready: true },
      { kind: 'bank-withdraw', amount: 1 },
      { kind: 'deck-draw', pieceId: deck.id },
      { kind: 'deck-shuffle', pieceId: deck.id },
      { kind: 'spawn-dismiss', requestId: 'any-request' },
    ]) {
      expect((await sendCommand(observer, action)).reply, action.kind).toMatchObject({
        type: 'rejected',
        message: SPECTATOR,
      });
    }
    for (const action of [{ kind: 'result-open' }, { kind: 'removal-start', seat: view.viewer.viewerSeat }]) {
      expect((await sendCommand(observer, action)).reply.type, action.kind).toBe('rejected');
    }
    let start = observer.messages.length;
    observer.send({
      type: 'begin',
      carryId: 'watching-carry',
      sourcePieceId: piece.id,
      expectedVersion: view.snapshot.versions[piece.id],
      pickup: 'whole',
    });
    observer.send({ type: 'pointer', seq: 1, position: [0, 0, 0] });
    expect(await repliesSince(observer, start, 2)).toEqual([
      ['rejected', SPECTATOR],
      ['rejected', SPECTATOR],
    ]);

    /* B names A's private pieces and A's side of their conversation; the room answers from B's own seat. */
    const own = factionOf(view);
    const other = factionOf(await syncView(b));
    const hidden = (await stored()).factionInventories[own];
    expect(hidden.length).toBeGreaterThan(0);
    expect((await sendCommand(b, { kind: 'flip', pieceId: hidden[0].id })).reply.type).toBe('rejected');
    expect(
      (await sendCommand(b, { kind: 'hand-play', pieceId: hidden[0].id, position: [0, 0, 0] })).reply
    ).toMatchObject({ type: 'rejected', message: 'That piece is not in your inventory.' });
    start = b.messages.length;
    b.send({ type: 'begin', carryId: 'other-hand', sourcePieceId: hidden[0].id, expectedVersion: 0, pickup: 'whole' });
    expect((await repliesSince(b, start, 1))[0][0]).toBe('rejected');
    for (const connection of [b, observer]) {
      start = connection.messages.length;
      connection.send({ type: 'conversation-send', requestId: 'spoof', factionId: own, peerId: other, text: 'As A' });
      connection.send({ type: 'conversation-history', requestId: 'read', factionId: own, peerId: other, before: 1e12 });
      expect(await repliesSince(connection, start, 2)).toEqual([
        ['rejected', 'This conversation is not available.'],
        ['rejected', 'This conversation is not available.'],
      ]);
    }
    expect(await revision(a)).toBe(held);
    expect((await stored()).factionInventories[own]).toEqual(hidden);
  });

  it('refuses a player who left their seat, even the drop of a carry they began while seated', async () => {
    const { a, b } = await inPlay();
    const view = await syncView(b);
    const piece = view.snapshot.table.pieces[0];
    b.send({
      type: 'begin',
      carryId: 'before-leaving',
      sourcePieceId: piece.id,
      expectedVersion: view.snapshot.versions[piece.id],
      pickup: 'whole',
    });
    await b.message('carry', (message) => message.carryId === 'before-leaving');
    await accepted(b, { kind: 'seat-depart' });
    const left = await syncView(b);
    expect(left.viewer.viewerSeat).toBe('neutral');
    expect(left.carries).toEqual([]);
    const held = await revision(a);
    const start = b.messages.length;
    b.send({ type: 'renew', carryId: 'before-leaving' });
    b.send({
      type: 'drop',
      commandId: 'after-leaving',
      carryId: 'before-leaving',
      position: [0.1, 0, 0.1],
      orientation: 0,
    });
    expect(await repliesSince(b, start, 2)).toEqual([
      ['rejected', SPECTATOR],
      ['rejected', SPECTATOR],
    ]);
    for (const action of [
      { kind: 'storm', direction: 1 },
      { kind: 'bank-withdraw', amount: 1 },
      { kind: 'ready', ready: true },
    ]) {
      expect((await sendCommand(b, action)).reply, action.kind).toMatchObject({ type: 'rejected', message: SPECTATOR });
    }
    expect((await sendCommand(b, { kind: 'seat-approve', requestId: 'any-request' })).reply).toMatchObject({
      type: 'rejected',
      message: 'Only a current player can approve a seat request.',
    });
    expect(await revision(a)).toBe(held);
    expect((await syncView(a)).snapshot.table.pieces.find((entry) => entry.id === piece.id)).toEqual(piece);
  });

  it('refuses a player removed by vote every draft and seat command on the socket they still hold', async () => {
    const [a, b, c] = [await admit('a'), await admit('b'), await admit('c')];
    await seat(b, a);
    await seat(c, a);
    const target = (await syncView(c)).viewer.viewerSeat;
    const vote = (await accepted(a, { kind: 'removal-start', seat: target })).snapshot.removalVotes[0];
    await accepted(a, { kind: 'removal-ballot', voteId: vote.id, choice: 'remove' });
    await accepted(b, { kind: 'removal-ballot', voteId: vote.id, choice: 'remove' });
    const removed = await syncView(c);
    expect(removed.viewer.viewerSeat).toBe('neutral');
    const factionId = removed.snapshot.draft.factions[0].id;
    const held = await revision(a);
    for (const action of [
      { kind: 'draft-ready', ready: true },
      { kind: 'draft-pick', factionId },
      { kind: 'draft-ban', factionId },
    ]) {
      expect((await sendCommand(c, action)).reply, action.kind).toMatchObject({
        type: 'rejected',
        message: 'Only a seated player drafts.',
      });
    }
    for (const action of [
      { kind: 'removal-start', seat: (await syncView(a)).viewer.viewerSeat },
      { kind: 'seat-approve', requestId: 'any-request' },
    ]) {
      expect((await sendCommand(c, action)).reply.type, action.kind).toBe('rejected');
    }
    expect(await revision(a)).toBe(held);
  });

  it('closes a connection that sends a malformed, oversized or binary frame, and keeps serving everyone else', async () => {
    const { a } = await inPlay();
    const held = await revision(a);
    const command = (action, commandId = 'malformed') => ({
      type: 'command',
      commandId,
      action,
      expectedRevision: held,
    });
    const frames = [
      '{not json',
      JSON.stringify({ type: 'unknown' }),
      JSON.stringify({ type: 'sync', seat: 'seat-1' }),
      JSON.stringify(command({ kind: 'storm', direction: 1, seat: 'seat-1' })),
      JSON.stringify({ type: 'sync', padding: 'x'.repeat(9000) }),
      JSON.stringify(command({ kind: 'bank-withdraw', amount: -5 })),
      JSON.stringify(command({ kind: 'split', pieceId: 'piece', count: 1e9 })),
      JSON.stringify(command({ kind: 'storm', direction: 1 }, 'i'.repeat(5000))),
      new Uint8Array([1, 2, 3]),
    ];
    for (const [index, frame] of frames.entries()) {
      const probe = await admit(`malformed${index}`);
      probe.socket.send(frame);
      await eventually(() => probe.closed, `frame ${index} closed`);
      expect(probe.closeCode, String(index)).toBe(4401);
      expect(probe.messages.at(-1), String(index)).toEqual({ type: 'admission', status: 'denied' });
    }
    expect(await revision(a)).toBe(held);
    expect((await sendCommand(a, { kind: 'storm', direction: 1 })).reply.type).not.toBe('rejected');
  });

  it('applies a repeated command once, even after a cold restart, keeps command IDs per player and refuses a stale revision', async () => {
    const { a, b } = await inPlay();
    const { message } = await sendCommand(a, { kind: 'storm', direction: 1 }, 'storm-once');
    const applied = await syncView(a);
    const repeated = a.messages.length;
    a.send(message);
    await eventually(
      () => a.messages.slice(repeated).find((view) => view.completedCommandId === 'storm-once'),
      'repeated confirmation'
    );
    expect(await revision(a)).toBe(applied.snapshot.revision);

    /* The same ID from another player is that player's own command. */
    expect((await sendCommand(b, { kind: 'storm', direction: 1 }, 'storm-once')).reply.type).not.toBe('rejected');
    const settled = await syncView(b);

    await runtime.restart();
    const returned = await admit('a');
    const start = returned.messages.length;
    returned.send(message);
    await eventually(
      () => returned.messages.slice(start).find((view) => view.completedCommandId === 'storm-once'),
      'replayed confirmation'
    );
    const restored = (await syncView(returned)).snapshot;
    expect(restored.revision).toBe(settled.snapshot.revision);
    expect(restored.table).toEqual(settled.snapshot.table);
    returned.send({ ...message, action: { kind: 'storm', direction: -1 } });
    expect(await returned.message('rejected', (reply) => reply.requestId === 'storm-once')).toMatchObject({
      message: 'That command ID was already used for different input.',
    });
    const stale = await sendCommand(returned, { kind: 'storm', direction: 1 }, 'stale', message.expectedRevision);
    expect(stale.reply).toMatchObject({ type: 'rejected', message: 'The table changed. Try the action again.' });
    expect((await syncView(returned)).snapshot.revision).toBe(settled.snapshot.revision);
  });
});
