// Bursts of concurrent GETs against the local Worker, separated by idle gaps swept across the 5 s keep-alive window.
// Usage: node sweep.mjs <origin> [concurrency] [fromSeconds] [toSeconds] [stepSeconds] [rounds]
const [origin, concurrencyArg = '24', fromArg = '3.0', toArg = '7.0', stepArg = '0.1', roundsArg = '3'] = process.argv.slice(2);
const concurrency = Number(concurrencyArg);
const from = Number(fromArg);
const to = Number(toArg);
const step = Number(stepArg);
const rounds = Number(roundsArg);
const paths = [
  '/vector/icon/spice.svg',
  '/vector/icon/combat.svg',
  '/vector/icon/mentat.svg',
  '/vector/icon/bidding_standalone.svg',
  '/vector/icon/revival_standalone.svg',
  '/vector/icon/shipment_disc.svg',
  '/vector/generic/chaom.svg',
  '/web/logo.svg',
  '/dune-zone-favicon.svg',
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;
let requests = 0;
async function burst() {
  const results = await Promise.allSettled(
    Array.from({ length: concurrency }, (_, index) =>
      fetch(`${origin}${paths[index % paths.length]}?n=${requests + index}`, { cache: 'no-store' }).then(async (res) => {
        await res.arrayBuffer();
        return res.status;
      })
    )
  );
  requests += concurrency;
  const bad = results.filter((result) => result.status === 'rejected' || result.value >= 500);
  failures += bad.length;
  return { bad, statuses: results.map((result) => (result.status === 'fulfilled' ? result.value : 'ERR')) };
}
const t0 = Date.now();
for (let round = 0; round < rounds; round += 1) {
  for (let gap = from; gap <= to + 1e-9; gap += step) {
    const { bad, statuses } = await burst();
    const summary = [...new Set(statuses)].join(',');
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s round ${round} gap ${gap.toFixed(1)} s statuses ${summary}${bad.length ? ` failed ${bad.length}` : ''}`);
    if (bad.some((result) => result.status === 'rejected' && /ECONNREFUSED/.test(String(result.reason?.cause?.code ?? result.reason)))) {
      console.log('The Worker refused connections; stopping.');
      process.exit(2);
    }
    await sleep(gap * 1000);
  }
}
console.log(`done: ${requests} requests, ${failures} failed`);
