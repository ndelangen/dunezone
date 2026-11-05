import { expect, test } from 'vite-plus/test';

import {
  accepted,
  admitPlayer,
  createPeer,
  createRuntime,
  provision,
  readHistoricalSnapshot,
  syncView,
  sendCommand,
} from './native-runtime.fixture';
import type { NativeConnection, NativeRuntime, NativeView } from './native-runtime.fixture';

const TOKEN_ID = 'secret-disc';
const FRONT = 'https://test.invalid/hidden-leader.jpg';

/** An older stored game, including messages about a secret piece that is no longer present. */
async function seedTokenAndLegacyHistory(runtime: NativeRuntime) {
  expect((await provision(runtime)).status).toBe(200);
  const rows = await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1');
  const snapshot = readHistoricalSnapshot(rows[0].data);
  snapshot.table.events = [
    {
      id: 'old-move',
      command: 'piece.move',
      message: 'Deleted secret moved to a free table position.',
      status: 'accepted',
    },
    {
      id: 'old-delete',
      command: 'piece.delete',
      message: 'Alice deleted Deleted secret from the game.',
      status: 'accepted',
    },
    { id: 'old-phase', command: 'phase', message: 'Turn 1: Storm.', status: 'accepted' },
  ];
  const base = snapshot.table.pieces.find((piece) => piece.kind === 'force')!;
  snapshot.table.pieces.push({
    ...base,
    id: TOKEN_ID,
    label: 'Hidden leader',
    stackKey: 'token-disc:secret',
    items: [
      {
        id: 'secret-disc-item',
        faceUp: true,
        artwork: {
          front: FRONT,
          back: 'https://test.invalid/common-back.jpg',
          name: 'Hidden leader',
          type: 'token-disc',
        },
      },
    ],
  });
  await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(snapshot)]);
  await runtime.exec('UPDATE history SET data=? WHERE step=0', [JSON.stringify(snapshot)]);
  await runtime.restart();
}

async function assertLegacyReadProtection(runtime: NativeRuntime, spectator: NativeConnection, view: NativeView) {
  expect(JSON.stringify(view.snapshot.table.events)).not.toContain('Deleted secret');
  expect(view.snapshot.table.events.find((event) => event.id === 'old-phase')?.message).toBe('Turn 1: Storm.');
  spectator.send({ type: 'history', step: 0 });
  const history = await spectator.message('history');
  expect(JSON.stringify(history)).not.toContain('Deleted secret');
  expect(JSON.stringify(history)).toContain('Turn 1: Storm.');
  const storedHistory = await runtime.exec<{ data: string }>('SELECT data FROM history WHERE step=0');
  expect(storedHistory[0].data).toContain('Deleted secret');
  expect(view.snapshot.table.events[0].publicCopyVersion).toBe(1);
  expect(view.snapshot.table.events[0].message).toBe('Token flipped face down.');
}

function assertHiddenToken(view: NativeView, id = TOKEN_ID) {
  expect(view.viewer.viewerSeat).toBe('neutral');
  expect(view.snapshot.peek).toBeUndefined();
  const token = view.snapshot.table.pieces.find((piece) => piece.id === id)!;
  expect(token.items[0].faceUp).toBe(false);
  expect(token.items[0].artwork).not.toHaveProperty('front');
  expect(token.items[0].artwork).not.toHaveProperty('name');
  expect(token.label).toBe('Token');
  expect(token.stackKey).not.toContain('secret');
  expect(JSON.stringify(view.snapshot.table.events)).not.toContain('Hidden leader');
  return token;
}

/*
 * Exercise private hand access and public actions, including a rejected action on the locked token.
 * The disc leaves the hand face down under a new id, so nobody can tie it to the disc it was; that id is returned.
 */
async function exerciseHandAndLock(player: NativeConnection) {
  const taken = await accepted(player, { kind: 'hand-take', pieceId: TOKEN_ID });
  const held = taken.snapshot.hand?.find((piece) => piece.id === TOKEN_ID);
  expect(held?.items[0].artwork?.front).toBe(FRONT);
  const played = await accepted(player, { kind: 'hand-play', pieceId: TOKEN_ID, position: [-6, 0, 6] });
  expect(played.snapshot.table.pieces.some((piece) => piece.id === TOKEN_ID)).toBe(false);
  const id = played.snapshot.table.pieces.find((piece) => piece.label === 'Token' && !piece.items[0].faceUp)!.id;
  const locked = await accepted(player, { kind: 'lock', pieceId: id });
  expect(locked.snapshot.table.pieces.find((piece) => piece.id === id)?.locked).toBe(true);
  const blocked = await sendCommand(player, { kind: 'flip', pieceId: id });
  expect(blocked.reply).toMatchObject({ type: 'rejected', message: 'Unlock Token first.' });
  await accepted(player, { kind: 'lock', pieceId: id });
  await accepted(player, { kind: 'rotate', pieceId: id, direction: 1 });
  return id;
}

async function assertPrivatePeek(player: NativeConnection, spectator: NativeConnection, id: string) {
  const own = await accepted(player, { kind: 'peek', pieceId: id });
  expect(own.snapshot.peek?.piece.items[0].artwork?.front).toBe(FRONT);
  return assertHiddenToken(await syncView(spectator), id);
}

async function assertColdRestore(runtime: NativeRuntime, id: string, stackKey: string | null) {
  await runtime.restart();
  const restored = await admitPlayer(runtime, 'c');
  const token = assertHiddenToken(await syncView(restored), id);
  expect(token.stackKey).toBe(stackKey);
}

test('a spectator cannot read the face of a face-down disc without a peek', async () => {
  const peer = await createPeer();
  const runtime = await createRuntime(peer);
  try {
    await seedTokenAndLegacyHistory(runtime);
    const player = await admitPlayer(runtime, 'a');
    await admitPlayer(runtime, 'b');
    await accepted(player, { kind: 'flip', pieceId: TOKEN_ID });
    const spectator = await admitPlayer(runtime, 'c');
    const view = await syncView(spectator);
    await assertLegacyReadProtection(runtime, spectator, view);
    const token = assertHiddenToken(view);
    const played = await exerciseHandAndLock(player);
    const replayed = await assertPrivatePeek(player, spectator, played);
    /* Face down, the disc is told apart from its asset's other copies, as it stacks with none of them while hidden. */
    expect(replayed.stackKey).not.toBe(token.stackKey);
    await assertColdRestore(runtime, played, replayed.stackKey);
  } finally {
    await runtime.close();
    await peer.close();
  }
}, 15_000);
