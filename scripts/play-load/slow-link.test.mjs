import { createConnection, createServer } from 'node:net';

import { expect, test } from 'vitest';

import { slowLink } from './slow-link.mjs';

test('latency stays pipelined while the link caps wire throughput and restores queued delivery', async () => {
  const sockets = new Set();
  const echo = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.pipe(socket);
  });
  await new Promise((resolve) => echo.listen(0, '127.0.0.1', resolve));
  const link = await slowLink(new URL(`http://127.0.0.1:${echo.address().port}`), {
    downlinkKbitPerSecond: 256,
    roundTripMs: 500,
  });
  const client = createConnection({ host: '127.0.0.1', port: Number(new URL(link.origin).port) });
  let received = 0;
  let completed;
  const done = new Promise((resolve) => {
    completed = resolve;
  });
  client.on('data', (chunk) => {
    received += chunk.length;
    if (received === 65_536) {
      completed();
    }
  });
  try {
    await new Promise((resolve) => client.once('connect', resolve));
    link.constrain();
    const started = performance.now();
    for (let index = 0; index < 128; index++) {
      client.write(Buffer.alloc(512, index));
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await done;
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(2400);
    expect(elapsed).toBeLessThan(5000);
    expect(link.totals.downlinkBytes).toBe(65_536);
    expect(link.totals.maxBufferedBytes).toBeLessThanOrEqual(131_072);
    const restored = new Promise((resolve) => client.once('data', resolve));
    client.write(Buffer.from('restored'));
    link.restore();
    await restored;
    expect(received).toBe(65_544);
  } finally {
    client.destroy();
    await link.close();
    for (const socket of sockets) {
      socket.destroy();
    }
    await new Promise((resolve) => echo.close(resolve));
  }
}, 10_000);
