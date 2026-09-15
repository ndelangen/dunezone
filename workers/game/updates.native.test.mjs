import { afterEach, beforeEach, expect, it } from 'vitest';

import { createPeer, createRuntime, eventually, openGame, provision } from './native-runtime.fixture.mjs';

let peer;
let runtime;
beforeEach(async () => {
  peer = await createPeer();
  peer.watchMode = 'allow';
  runtime = await createRuntime(peer, 'game');
  await provision(runtime);
});
afterEach(async () => {
  await runtime?.close();
  await peer?.close();
});

it('coalesces a burst to the latest pointer while preserving an immediate committed snapshot', async () => {
  const connection = await openGame(runtime);
  connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
  await connection.message('view');
  connection.messages.length = 0;
  const pointerCount = 20;
  const startedAt = performance.now();
  for (let seq = 0; seq < pointerCount; seq++) {
    connection.send({ type: 'pointer', seq, position: [seq, 0, 0] });
  }
  await connection.message('activity', (message) => message.pointers[0]?.sourceSeq === pointerCount - 1);
  const windows = Math.max(1, Math.ceil((performance.now() - startedAt) / 50));
  /* Allow one scheduling boundary, while still requiring the burst to coalesce. */
  const maximum = Math.min(pointerCount - 1, windows + 1);
  expect(connection.messages.filter((message) => message.type === 'activity').length).toBeLessThanOrEqual(maximum);
  connection.send({ type: 'command', commandId: 'turn', expectedRevision: 0, action: { kind: 'turn', turn: 2 } });
  expect((await connection.message('view', (message) => message.completedCommandId === 'turn')).snapshot.revision).toBe(
    1
  );
});

it('negotiates compact updates and supplies a full snapshot on resync', async () => {
  const connection = await openGame(runtime);
  connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
  const initial = await connection.message('view');
  expect(initial.updates).toBe(2);
  connection.send({ type: 'sync' });
  await connection.message('view', (message) => message.sequence > initial.sequence);
  connection.send({ type: 'command', commandId: 'turn', expectedRevision: 0, action: { kind: 'turn', turn: 2 } });
  const update = await connection.message('update', (message) => message.completedCommandId === 'turn');
  expect(update.snapshot.baseRevision).toBe(0);
  expect(update.snapshot.revision).toBe(1);
  expect(JSON.stringify(update).length).toBeLessThan(JSON.stringify(initial).length / 2);
  connection.send({ type: 'sync' });
  const restored = await connection.message('view', (message) => message.snapshot.revision === 1);
  expect(restored.sequence).toBeGreaterThan(update.sequence);
  expect(restored.snapshot.table.pieces).toEqual(initial.snapshot.table.pieces);
  expect(await eventually(() => !connection.closed, 'open connection')).toBe(true);
});
