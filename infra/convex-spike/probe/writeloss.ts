/**
 * Write-loss probe for #2078.
 *   bun writeloss.ts write <log> <seconds> [concurrency]  writes over HTTP, appending every acknowledged n to <log>,
 *                                                          while a WebSocket client logs disconnects and reconnects.
 *   bun writeloss.ts check <log>                           asks the backend which logged n are missing.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { ConvexClient, ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const SPIKE = 'https://convex-spike.ndelangen.workers.dev';
const [mode, log, secondsArg, concurrencyArg] = process.argv.slice(2);
const stamp = () => new Date().toISOString();

if (mode === 'write') {
  const seconds = Number(secondsArg ?? 120);
  const concurrency = Number(concurrencyArg ?? 8);
  const socket = new ConvexClient(SPIKE);
  let connected: boolean | undefined;
  const watch = setInterval(() => {
    const state = socket.connectionState();
    if (state.isWebSocketConnected !== connected) {
      connected = state.isWebSocketConnected;
      console.log(`${stamp()} websocket ${connected ? 'connected' : 'disconnected'}`);
    }
  }, 50);
  socket.onUpdate(anyApi.spikeWrites!.latest!, {}, () => {});
  const end = Date.now() + seconds * 1000;
  let next = Date.now() * 1000;
  let acknowledged = 0;
  let failures = 0;
  let failingSince: number | undefined;
  // One client per worker: a ConvexHttpClient runs its own mutations one at a time.
  const worker = async () => {
    const client = new ConvexHttpClient(SPIKE);
    while (Date.now() < end) {
      const n = next++;
      try {
        await client.mutation(anyApi.spikeWrites!.add!, { n, client: 'writeloss' });
        appendFileSync(log!, `${n} ${Date.now()}\n`);
        acknowledged++;
        if (failingSince !== undefined) {
          console.log(`${stamp()} writes recovered after ${Date.now() - failingSince} ms of failures`);
          failingSince = undefined;
        }
      } catch (error) {
        failures++;
        if (failingSince === undefined) {
          failingSince = Date.now();
          console.log(`${stamp()} writes failing: ${String(error).slice(0, 160)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  };
  const started = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  clearInterval(watch);
  await socket.close();
  console.log(`${stamp()} done: ${acknowledged} acknowledged (${((acknowledged * 1000) / (Date.now() - started)).toFixed(0)}/s), ${failures} failed attempts`);
} else if (mode === 'check') {
  const client = new ConvexHttpClient(SPIKE);
  const rows = readFileSync(log!, 'utf8').trim().split('\n').map((line) => line.split(' ').map(Number) as [number, number]);
  const missing: [number, number][] = [];
  for (let start = 0; start < rows.length; start += 500) {
    const batch = rows.slice(start, start + 500);
    const absent = new Set(await client.query(anyApi.spikeWrites!.missing!, { ns: batch.map(([n]) => n) }));
    missing.push(...batch.filter(([n]) => absent.has(n)));
  }
  console.log(`${rows.length} acknowledged, ${missing.length} missing`);
  if (missing.length > 0) {
    console.log(`missing acknowledged between ${new Date(missing[0]![1]).toISOString()} and ${new Date(missing.at(-1)![1]).toISOString()}`);
  }
} else {
  console.log('usage: writeloss.ts write <log> <seconds> [concurrency] | check <log>');
}
