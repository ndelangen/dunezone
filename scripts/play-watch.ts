/*
 * Watches the live game Worker during a play session: `bun run play:watch [--out file] [--say]`.
 * It runs the read-only `wrangler tail dunezone-game --format json` with the operator's own Wrangler login,
 * keeps Play's log records (see scripts/lib/play-watch.ts) in a JSON Lines file, and prints one line each.
 * With --say, an operation failure is spoken on macOS at most once every ten minutes.
 */
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import { describe, JsonStream, playRecords } from './lib/play-watch';

const SAY_INTERVAL_MS = 10 * 60_000;

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : `play-watch-${new Date().toISOString().slice(0, 10)}.jsonl`;
const speak = args.includes('--say');
let spokeAt = 0;

const tail = spawn(process.execPath, ['x', 'wrangler', 'tail', 'dunezone-game', '--format', 'json'], {
  stdio: ['ignore', 'pipe', 'inherit'],
});
const stream = new JsonStream();
tail.stdout.setEncoding('utf8');
tail.stdout.on('data', (chunk: string) => {
  for (const event of stream.push(chunk)) {
    for (const record of playRecords(event)) {
      appendFileSync(out!, `${JSON.stringify(record)}\n`);
      console.log(describe(record));
      if (speak && record.event === 'game-operation-failed' && Date.now() - spokeAt >= SAY_INTERVAL_MS) {
        spokeAt = Date.now();
        spawn('say', [`Dune Play needs attention: a live game reported a ${String(record.operation)} failure.`]);
      }
    }
  }
});
tail.on('exit', (code) => {
  console.log(`wrangler tail ended (${code ?? 'signal'}); records are in ${out}`);
  process.exit(code ?? 0);
});
process.on('SIGINT', () => tail.kill('SIGINT'));
