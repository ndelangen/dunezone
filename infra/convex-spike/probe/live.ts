/**
 * Two WebSocket clients through the Worker: A watches spikeWrites:latest, B writes; reports how long A takes to see each write.
 * Run: bun infra/convex-spike/probe/live.ts [writes]
 */
import { ConvexClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const SPIKE = 'https://convex-spike.ndelangen.workers.dev';
const writes = Number(process.argv[2] ?? 20);

const watcher = new ConvexClient(SPIKE);
const writer = new ConvexClient(SPIKE);
const seen = new Map<number, number>();
let ready: () => void;
const subscribed = new Promise<void>((resolve) => (ready = resolve));
watcher.onUpdate(anyApi.spikeWrites!.latest!, {}, (row: { n: number } | null) => {
  ready();
  if (row) {
    seen.set(row.n, performance.now());
  }
});
await subscribed;

const base = Date.now() * 1000;
const sentAt: number[] = [];
const ackMs: number[] = [];
const seenMs: number[] = [];
for (let i = 0; i < writes; i++) {
  const n = base + i;
  const started = performance.now();
  sentAt.push(started);
  await writer.mutation(anyApi.spikeWrites!.add!, { n, client: 'live' });
  ackMs.push(performance.now() - started);
  const deadline = performance.now() + 5000;
  while (!seen.has(n) && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  seenMs.push(seen.has(n) ? seen.get(n)! - started : Number.NaN);
  await new Promise((resolve) => setTimeout(resolve, 100));
}
const summary = (label: string, values: number[]) => {
  const sorted = values.filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  console.log(`${label}: p50 ${sorted[Math.floor(sorted.length / 2)]!.toFixed(0)} / max ${sorted.at(-1)!.toFixed(0)} ms (${sorted.length}/${values.length})`);
};
summary('writer mutation ack', ackMs);
summary('watcher saw the write (from send)', seenMs);
await watcher.close();
await writer.close();
