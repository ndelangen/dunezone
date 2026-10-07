import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { createPeer, createRuntime, openGame, syncView, eventually } from './native-runtime.fixture.mjs';

let peer;
let runtime;
let sockets;
beforeEach(async () => {
  sockets = [];
  peer = await createPeer();
  runtime = await createRuntime(peer, 'homepage');
  sockets = [];
});
afterEach(async () => {
  for (const connection of sockets) {
    if (connection.socket.readyState === 1) {
      connection.socket.close();
    }
  }
  await runtime?.close();
  await peer?.close();
});

async function visitor(member = false, now) {
  const connection = await openGame(runtime, '/__play/homepage/socket');
  sockets.push(connection);
  await connection.message('view');
  if (member) {
    peer.homepageAdmission = {
      allowed: true,
      userKey: crypto.randomUUID(),
      leaseUntil: (now ?? Date.now()) + 30_000,
      avatarUrl: 'https://dune.zone/avatar/test.webp',
    };
    connection.send({ type: 'authenticate', ticket: 'a'.repeat(64) });
    await connection.message('view', (view) => view.viewer.viewerSeat !== SPECTATOR_SEAT);
  }
  return connection;
}
async function act(connection, message, view) {
  const base = view ?? (await syncView(connection));
  connection.send({ type: 'act', epoch: base.epoch, message });
  return base;
}
async function command(connection, action) {
  const view = await syncView(connection);
  const commandId = crypto.randomUUID();
  await act(connection, { type: 'command', commandId, expectedRevision: view.snapshot.revision, action }, view);
  return connection.message('view', (next) => next.completedCommandId === commandId);
}

describe('the public homepage table', () => {
  it('lets visitors observe but refuses anonymous handling', async () => {
    const guest = await visitor();
    const view = await syncView(guest);
    expect(view.snapshot.table.pieces).toHaveLength(23);
    await act(
      guest,
      {
        type: 'command',
        commandId: 'denied',
        expectedRevision: view.snapshot.revision,
        action: { kind: 'rotate', pieceId: 'treachery-card-loose', direction: 1 },
      },
      view
    );
    expect((await guest.message('rejected')).requestId).toBe('denied');
    expect((await syncView(guest)).snapshot.revision).toBe(0);
  });

  it('shares authenticated profile avatars without names and clears them when admission ends', async () => {
    const member = await visitor(true);
    const observer = await visitor();
    const view = await syncView(member);
    expect(view.viewer.avatarUrl).toBe(peer.homepageAdmission.avatarUrl);
    await act(member, { type: 'pointer', position: [1, 1, 1], seq: 1 }, view);
    const shared = await observer.message('view', (next) =>
      next.pointers.some((pointer) => pointer.connectionId === view.viewer.connectionId)
    );
    expect(shared.pointers).toMatchObject([{ avatarUrl: peer.homepageAdmission.avatarUrl, displayName: '' }]);
    member.send({ type: 'anonymous' });
    const anonymous = await syncView(member);
    expect(anonymous.viewer.avatarUrl).toBeUndefined();
    expect((await syncView(observer)).pointers).toEqual([]);
  });

  it('shares physical rotation and flipping with another visitor through compact updates', async () => {
    const member = await visitor(true);
    const observer = await visitor();
    const rotated = await command(member, { kind: 'rotate', pieceId: 'treachery-card-loose', direction: 1 });
    expect(rotated.snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose').orientation).toBeCloseTo(
      -Math.PI / 12
    );
    const flipped = await command(member, { kind: 'flip', pieceId: 'treachery-card-loose' });
    expect(flipped.snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose').items[0].faceUp).toBe(
      false
    );
    expect((await syncView(observer)).snapshot.revision).toBe(flipped.snapshot.revision);
    expect(observer.messages.some((message) => message.type === 'update' && message.snapshot?.pieceMoves?.length)).toBe(
      true
    );
  });

  it('settles a drop away from an occupied position and releases abandoned carries', async () => {
    const member = await visitor(true);
    const observer = await visitor();
    const view = await syncView(member);
    const source = view.snapshot.table.pieces.find((piece) => piece.id === 'starting-1-carthag');
    const target = view.snapshot.table.pieces.find((piece) => piece.id === 'starting-0-arrakeen');
    await act(
      member,
      { type: 'begin', carryId: 'held', sourcePieceId: source.id, expectedVersion: 0, pickup: 'whole' },
      view
    );
    await member.message('carry');
    await act(
      member,
      { type: 'drop', carryId: 'held', commandId: 'land', position: target.position, orientation: 0 },
      view
    );
    const dropped = await member.message('view', (next) => next.completedCommandId === 'land');
    const settled = dropped.snapshot.table.pieces.find((piece) => piece.id === source.id).position;
    expect(Math.hypot(settled[0] - target.position[0], settled[2] - target.position[2])).toBeGreaterThan(0.2);
    await act(
      member,
      {
        type: 'begin',
        carryId: 'abandoned',
        sourcePieceId: source.id,
        expectedVersion: dropped.snapshot.versions[source.id],
        pickup: 'top',
      },
      dropped
    );
    await member.message('carry', (message) => message.carryId === 'abandoned');
    member.socket.close();
    await eventually(async () => (await syncView(observer)).carries.length === 0, 'carry released');
  });

  it('gives a contested piece to one visitor and hides names and account identifiers', async () => {
    const first = await visitor(true);
    const second = await visitor(true);
    const before = await syncView(first);
    await act(
      first,
      { type: 'begin', carryId: 'first', sourcePieceId: 'starting-1-carthag', expectedVersion: 0, pickup: 'top' },
      before
    );
    await first.message('carry', (message) => message.carryId === 'first');
    await act(second, {
      type: 'begin',
      carryId: 'second',
      sourcePieceId: 'starting-1-carthag',
      expectedVersion: 0,
      pickup: 'top',
    });
    expect((await second.message('rejected')).requestId).toBe('second');
    const shared = await syncView(second);
    expect(shared.carries).toHaveLength(1);
    expect(shared.viewer.displayName).toBe('');
    expect(JSON.stringify(shared)).not.toContain(peer.homepageAdmission.userKey);
  });

  it.each([
    ['', false],
    [' across the hourly reset', true],
  ])(
    'ends handling permission and releases a held piece when its sign-in lease expires%s',
    async (_suffix, beforeReset) => {
      const nextHour = (Math.floor(Date.now() / 3_600_000) + 2) * 3_600_000;
      const now = nextHour + (beforeReset ? -15_000 : 300_000);
      await runtime.fetch(`/native-test/clock?now=${now}`);
      const member = await visitor(true, now);
      if (!beforeReset) {
        /* Keep the carry younger than its own eight-second expiry when the sign-in lease ends. */
        await runtime.fetch(`/native-test/clock?now=${now + 25_000}`);
      }
      const held = await act(member, {
        type: 'begin',
        carryId: 'expired',
        sourcePieceId: 'starting-1-carthag',
        expectedVersion: 0,
        pickup: 'top',
      });
      await member.message('carry');
      expect((await syncView(member)).carries).toHaveLength(1);
      const before = member.messages.length;
      await runtime.fetch(`/native-test/clock?now=${now + 31_000}`);
      /*
       * The reset and lease expiry can send separate views.
       * Observe the downgrade after this clock change.
       */
      const expired = await eventually(
        () =>
          member.messages
            .slice(before)
            .find((frame) => frame.type === 'view' && frame.viewer.viewerSeat === SPECTATOR_SEAT),
        'lease expiry view'
      );
      expect(expired.viewer.viewerSeat).toBe(SPECTATOR_SEAT);
      expect(expired.carries).toEqual([]);
      expect(expired.epoch === held.epoch).toBe(!beforeReset);
      await act(
        member,
        {
          type: 'command',
          commandId: 'after-expiry',
          expectedRevision: expired.snapshot.revision,
          action: { kind: 'flip', pieceId: 'treachery-card-loose' },
        },
        expired
      );
      const rejected = await member.message('rejected');
      expect(rejected.requestId).toBe('after-expiry');
      expect(rejected.message).toContain('Sign in');
    }
  );

  it('keeps anonymous downgrades quiet and limits full-table requests separately from motion', async () => {
    const guest = await visitor();
    const observer = await visitor();
    const received = observer.messages.length;
    for (let n = 0; n < 60; n++) {
      guest.send({ type: 'anonymous' });
    }
    await syncView(guest);
    expect(observer.messages).toHaveLength(received);
    for (let n = 0; n < 10; n++) {
      guest.send({ type: 'sync' });
    }
    await eventually(() => guest.closed, 'control flood closed');
    expect(guest.closeCode).toBe(1008);
    expect(guest.messages.filter((message) => message.type === 'view').length).toBeLessThanOrEqual(9);
  });

  it('resets the prepared table hourly and rejects a gesture from the previous hour', async () => {
    const member = await visitor(true);
    const before = await syncView(member);
    await act(
      member,
      {
        type: 'begin',
        carryId: 'cross-hour',
        sourcePieceId: 'starting-1-carthag',
        expectedVersion: 0,
        pickup: 'whole',
      },
      before
    );
    await member.message('carry');
    await runtime.fetch('/native-test/clock?offset=3600001');
    const reset = await syncView(member);
    expect(reset.epoch).not.toBe(before.epoch);
    expect(reset.carries).toEqual([]);
    expect(reset.snapshot.table.pieces).toEqual(before.snapshot.table.pieces);
    await act(
      member,
      { type: 'drop', carryId: 'cross-hour', commandId: 'stale', position: [0, 0.5, 0], orientation: 0 },
      before
    );
    expect((await member.message('rejected', (message) => message.requestId === 'stale')).message).toContain('reset');
  });
});

it('reports invalid admission responses and recovery without tickets or response content', async () => {
  const guest = await visitor();
  peer.homepageAdmission = { allowed: 'private backend detail' };
  guest.send({ type: 'authenticate', ticket: 'a'.repeat(64) });
  const failure = await eventually(
    () => runtime.logs.find((log) => log.message.includes('game-operation-failed')),
    'homepage admission diagnostic'
  );
  expect(failure.message).toContain("failureCategory: 'invalid-response'");
  expect(failure.message).toContain("roomClass: 'HomepageRoom'");
  expect(failure.message).toContain("workerVersionId: 'native-test'");
  expect(failure.message).toContain('connections: 1');
  expect(failure.message).toContain('revision: 0');
  expect(failure.message).toContain('durationMs:');
  expect(JSON.stringify(runtime.logs)).not.toContain('private backend detail');
  expect(JSON.stringify(runtime.logs)).not.toContain('a'.repeat(64));
  peer.homepageAdmission = { allowed: false };
  guest.send({ type: 'authenticate', ticket: 'b'.repeat(64) });
  await guest.message('view');
  const recovery = await eventually(
    () => runtime.logs.find((log) => log.message.includes('game-operation-recovered')),
    'homepage admission recovery'
  );
  expect(recovery.message).toContain('failures: 1');
  expect(recovery.message).toContain('outageMs:');
  const count = runtime.logs.length;
  await syncView(guest);
  expect(runtime.logs).toHaveLength(count);
});
