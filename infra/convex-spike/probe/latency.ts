/**
 * Latency from this machine: the anonymous catalogue query on the spike and on production Convex Cloud (read-only),
 * and a mutation on the spike only.
 * Run: bun infra/convex-spike/probe/latency.ts [rounds]
 */
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const SPIKE = 'https://convex-spike.ndelangen.workers.dev';
const PRODUCTION = 'https://exuberant-finch-263.eu-west-1.convex.cloud';
const rounds = Number(process.argv[2] ?? 30);
const uncached: number[] = [];

async function time(label: string, call: () => Promise<unknown>) {
  const samples: number[] = [];
  let size = 0;
  for (let round = 0; round < rounds; round++) {
    const started = performance.now();
    const result = await call();
    samples.push(performance.now() - started);
    size = JSON.stringify(result).length;
  }
  const [first, ...rest] = samples;
  rest.sort((a, b) => a - b);
  const pick = (q: number) => rest[Math.min(rest.length - 1, Math.floor(q * rest.length))]!.toFixed(0);
  console.log(`${label}: first ${first!.toFixed(0)} ms, then p50 ${pick(0.5)} / p90 ${pick(0.9)} / max ${pick(1)} ms (n=${rest.length}, ${size} bytes)`);
}

const spike = new ConvexHttpClient(SPIKE);
const production = new ConvexHttpClient(PRODUCTION);
await time('production factions:cataloguePage', () => production.query(anyApi.factions!.cataloguePage!, {}));
await time('spike factions:cataloguePage', () => spike.query(anyApi.factions!.cataloguePage!, {}));
await time('spike factions:cataloguePage, cache missed', async () => {
  await spike.mutation(anyApi.spikeWrites!.touchFaction!, {});
  const started = performance.now();
  const result = await spike.query(anyApi.factions!.cataloguePage!, {});
  uncached.push(performance.now() - started);
  return result;
});
uncached.sort((a, b) => a - b);
console.log(`  query alone after a cache miss: p50 ${uncached[Math.floor(uncached.length / 2)]!.toFixed(0)} / max ${uncached.at(-1)!.toFixed(0)} ms`);
let n = Date.now() * 1000;
await time('spike spikeWrites:add', () => spike.mutation(anyApi.spikeWrites!.add!, { n: n++, client: 'latency' }));
