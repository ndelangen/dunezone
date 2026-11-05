/*
 * The whole bot demo in one command: the real GF9 catalogue, the local Play stack (backend and frontend) and the bots'
 * manager page. You create the game in the browser; the bots join only the game you start from the manager page.
 *
 *   bun run play:bot:up                       # GF9, two bot accounts
 *   bun run play:bot:up -- --bots 3           # more bot accounts
 *   bun run play:bot:up -- --ruleset <slug>   # another ruleset from the live site
 *
 * The first run copies the ruleset's catalogue, images and rulebooks from the live site's public pages
 * (`play:bot:pull`, read-only); later runs reuse that copy (`--pull` copies it again). Ctrl-C stops everything,
 * the bots' harnesses included.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { BOTS_DIR, claimOf } from './claims';
import { MIRROR_FILE } from './mirror';

const { values } = parseArgs({
  options: {
    ruleset: { type: 'string', default: 'gf9' },
    bots: { type: 'string', default: '2' },
    pull: { type: 'boolean', default: false },
    'manager-port': { type: 'string', default: '4747' },
  },
});
const root = path.join(import.meta.dirname, '../..');
const mirror = path.join(import.meta.dirname, 'out/mirror', values.ruleset!);
const children: ChildProcess[] = [];

function run(args: string[], label: string, onLine?: (line: string) => void) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  const relay = (stream: NodeJS.WritableStream) => (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      stream.write(`[${label}] ${line}\n`);
      onLine?.(line);
    }
  };
  child.stdout!.on('data', relay(process.stdout));
  child.stderr!.on('data', relay(process.stderr));
  return child;
}

/** Ends every harness on this machine: they run on their own, so the manager's Stop or this is what ends them. */
function stopHarnesses() {
  for (const id of existsSync(BOTS_DIR) ? readdirSync(BOTS_DIR) : []) {
    const claim = claimOf(id);
    if (claim) {
      try {
        process.kill(claim.pid, 'SIGINT');
      } catch {
        /* Already gone. */
      }
    }
  }
}

let stopping = false;
function stop(code = 0) {
  if (stopping) {
    return;
  }
  stopping = true;
  console.log('\nStopping the bots, the manager and the stack...');
  stopHarnesses();
  for (const child of children) {
    child.kill('SIGINT');
  }
  setTimeout(() => process.exit(code), 15_000).unref();
  void Promise.all(children.map((child) => new Promise((resolve) => (child.exitCode !== null ? resolve(null) : child.once('exit', resolve))))).then(
    () => process.exit(code)
  );
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

/* 1. The ruleset's catalogue, copied once. */
if (values.pull || !existsSync(path.join(mirror, MIRROR_FILE))) {
  console.log(`Copying the ${values.ruleset} catalogue from the live site (read-only, once)...`);
  const pull = run([path.join(import.meta.dirname, 'pull.ts'), '--ruleset', values.ruleset!], 'pull');
  const code = await new Promise<number | null>((resolve) => pull.once('exit', resolve));
  children.splice(children.indexOf(pull), 1);
  if (code !== 0) {
    console.error('The catalogue copy failed; see above.');
    process.exit(1);
  }
}

/* 2. The stack, serving that copy, with one account per bot. */
let origin: string | undefined;
const stack = run(
  ['--no-env-file', path.join(root, 'scripts/verify-hosted-play-stack.ts'), '--serve', '--mirror', mirror, '--bots', values.bots!],
  'stack',
  (line) => {
    const up = /Play is up at (\S+)/u.exec(line);
    if (up && !origin) {
      origin = up[1];
      startManager();
    }
  }
);
stack.once('exit', (code) => {
  if (!stopping) {
    console.error(`The stack stopped (${code}).`);
    stop(1);
  }
});

/* 3. The manager page, once the stack has written its accounts. */
function startManager() {
  run([path.join(import.meta.dirname, 'page.ts'), '--port', values['manager-port']!], 'bots', (line) => {
    const page = /Every bot on this machine: (\S+)/u.exec(line);
    if (page) {
      const player = (JSON.parse(readFileSync(path.join(import.meta.dirname, 'out/stack.json'), 'utf8')) as {
        accounts: { player: { email: string; password: string } };
      }).accounts.player;
      console.log(
        [
          '',
          'Everything is up.',
          `1. Sign in at ${origin}/auth/login as ${player.email}, password ${player.password}.`,
          `2. Create a game at ${origin}/play/create on the "(local copy)" ruleset, and copy its URL.`,
          `3. Open the bots' manager at ${page[1]}, paste the game URL, list the bots' factions (such as fremen,harkonnen)`,
          '   and press Start bots. Approve each seat request at the table.',
          '4. Talk to a bot at the table by its faction\'s name, or privately. Ctrl-C here stops everything.',
          '',
        ].join('\n')
      );
    }
  });
}
