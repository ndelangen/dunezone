import { expect, test } from 'vite-plus/test';

import type { PieceAction } from '../../src/shared/play/protocol';
import {
  admitPlayer,
  createPeer,
  createRuntime,
  provision,
  readHistoricalSnapshot,
  syncView,
  sendCommand,
} from './native-runtime.fixture';

test('a spectator cannot read the face of a face-down disc without a peek', async () => {
  const peer = await createPeer();
  const runtime = await createRuntime(peer);
  try {
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
      id: 'secret-disc',
      label: 'Hidden leader',
      stackKey: 'token-disc:secret',
      items: [
        {
          id: 'secret-disc-item',
          faceUp: true,
          artwork: {
            front: 'https://test.invalid/hidden-leader.jpg',
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
    const player = await admitPlayer(runtime, 'a');
    await admitPlayer(runtime, 'b');
    const flipped = await sendCommand(player, { kind: 'flip', pieceId: 'secret-disc' });
    expect(flipped.reply.type).not.toBe('rejected');
    const spectator = await admitPlayer(runtime, 'c');
    const view = await syncView(spectator);
    expect(view.viewer.viewerSeat).toBe('neutral');
    expect(view.snapshot.peek).toBeUndefined();
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
    const token = view.snapshot.table.pieces.find((piece) => piece.id === 'secret-disc')!;
    expect(token.items[0].faceUp).toBe(false);
    expect(token.items[0].artwork).not.toHaveProperty('front');
    expect(token.items[0].artwork).not.toHaveProperty('name');
    expect(token.label).toBe('Token');
    expect(token.stackKey).not.toContain('secret');
    expect(JSON.stringify(view.snapshot.table.events)).not.toContain('Hidden leader');
    for (const action of [
      { kind: 'hand-take', pieceId: token.id },
      { kind: 'hand-play', pieceId: token.id, position: [-6, 0, 6] },
      { kind: 'lock', pieceId: token.id },
      { kind: 'lock', pieceId: token.id },
      { kind: 'rotate', pieceId: token.id, direction: 1 },
    ] satisfies PieceAction[]) {
      const result = await sendCommand(player, action);
      expect(result.reply.type).not.toBe('rejected');
      if (action.kind === 'lock') {
        const current = (await syncView(player)).snapshot.table.pieces.find((piece) => piece.id === token.id);
        if (current?.locked) {
          const blocked = await sendCommand(player, { kind: 'flip', pieceId: token.id });
          expect(blocked.reply).toMatchObject({ type: 'rejected', message: 'Unlock Token first.' });
        }
      }
      if (action.kind === 'hand-take') {
        const held = (await syncView(player)).snapshot.hand?.find((piece) => piece.id === token.id);
        expect(held?.items[0].artwork?.front).toBe('https://test.invalid/hidden-leader.jpg');
      }
    }
    const peek = await sendCommand(player, { kind: 'peek', pieceId: token.id });
    expect(peek.reply.type).not.toBe('rejected');
    const own = await syncView(player);
    expect(own.snapshot.peek?.piece.items[0].artwork?.front).toBe('https://test.invalid/hidden-leader.jpg');
    const afterPeek = await syncView(spectator);
    expect(JSON.stringify(afterPeek.snapshot.table.events)).not.toContain('Hidden leader');
    expect(afterPeek.snapshot.table.pieces.find((piece) => piece.id === token.id)?.items[0].artwork).not.toHaveProperty(
      'front'
    );
    await runtime.restart();
    const restored = await admitPlayer(runtime, 'c');
    const restoredToken = (await syncView(restored)).snapshot.table.pieces.find((piece) => piece.id === token.id)!;
    expect(restoredToken).toMatchObject({ label: 'Token', stackKey: token.stackKey });
    expect(restoredToken.items[0].artwork).not.toHaveProperty('front');
  } finally {
    await runtime.close();
    await peer.close();
  }
}, 15_000);
