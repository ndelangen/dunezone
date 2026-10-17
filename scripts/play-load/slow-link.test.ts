import assert from 'node:assert/strict';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';

import { expect, test } from 'vite-plus/test';

import { slowLink } from './slow-link.ts';

test('latency stays pipelined while the link caps wire throughput and restores queued delivery', async () => {
  const sockets = new Set<Socket>();
  const echo = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.pipe(socket);
  });
  await new Promise<void>((resolve) => echo.listen(0, '127.0.0.1', resolve));
  const address = echo.address();
  assert.ok(address && typeof address === 'object');
  const link = await slowLink(new URL(`http://127.0.0.1:${address.port}`), {
    downlinkKbitPerSecond: 1024,
    roundTripMs: 100,
  });
  const client = createConnection({ host: '127.0.0.1', port: Number(new URL(link.origin).port) });
  let received = 0;
  let completed: () => void;
  const done = new Promise<void>((resolve) => {
    completed = resolve;
  });
  client.on('data', (chunk) => {
    received += chunk.length;
    if (received === 32_768) {
      completed();
    }
  });
  try {
    await new Promise((resolve) => client.once('connect', resolve));
    link.constrain();
    const started = performance.now();
    /* The writes outpace the link, so 32 KiB at 1024 kbit/s takes 256 ms on the wire plus one 100 ms round trip. */
    for (let index = 0; index < 32; index++) {
      client.write(Buffer.alloc(1024, index));
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    await done;
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(330);
    expect(elapsed).toBeLessThan(1000);
    expect(link.totals.downlinkBytes).toBe(32_768);
    expect(link.totals.maxBufferedBytes).toBeLessThanOrEqual(131_072);
    const restored = new Promise((resolve) => client.once('data', resolve));
    client.write(Buffer.from('restored'));
    link.restore();
    await restored;
    expect(received).toBe(32_776);
  } finally {
    client.destroy();
    await link.close();
    for (const socket of sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve, reject) => echo.close((error) => (error ? reject(error) : resolve())));
  }
}, 10_000);

test('a hosted origin relays to its TLS port and a loopback origin keeps its explicit port', async () => {
  const settings = { downlinkKbitPerSecond: 256, roundTripMs: 500 };
  const hosted = await slowLink(new URL('https://dunezone-play-load-1.ndelangen.workers.dev'), settings);
  const loopback = await slowLink(new URL('http://127.0.0.1:4321'), settings);
  try {
    expect(hosted.upstream).toEqual({ host: 'dunezone-play-load-1.ndelangen.workers.dev', port: 443 });
    expect(loopback.upstream).toEqual({ host: '127.0.0.1', port: 4321 });
  } finally {
    await hosted.close();
    await loopback.close();
  }
});
