/*
 * Seats several bots in one game, each as its own `play:bot` process with its own account, so they share nothing:
 *
 *   bun run play:bot:table -- --game http://127.0.0.1:PORT/play/<game> --factions fremen,harkonnen
 *
 * The first faction goes to bot account 1, the next to account 2, and so on; start the stack with as many (`--bots 2`).
 * Every other option (--brain, --model, --style, --listen, --max-wakes) is passed to each bot. Ctrl-C stops them all.
 * Like a single bot, it only joins the game it is given and never creates one.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    game: { type: 'string' },
    factions: { type: 'string', default: 'fremen,harkonnen' },
  },
  strict: false,
});
if (typeof values.game !== 'string') {
  throw new Error('Pass --game with the game page URL from your browser.');
}
const factions = String(values.factions)
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
/* Everything but --game and --factions goes to each bot unchanged, in the order it was given. */
const passed: string[] = [];
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index++) {
  const arg = argv[index]!;
  if (arg === '--game' || arg === '--factions') {
    index++;
  } else if (!arg.startsWith('--game=') && !arg.startsWith('--factions=')) {
    passed.push(arg);
  }
}
const children = factions.map((faction, index) => {
  const child = spawn(
    process.execPath,
    [
      path.join(import.meta.dirname, 'local.ts'),
      '--game',
      String(values.game),
      '--account',
      String(index + 1),
      '--want',
      faction,
      ...passed,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const prefix = `[bot ${index + 1}, ${faction}] `;
  const relay = (stream: NodeJS.WritableStream) => (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      stream.write(`${prefix}${line}\n`);
    }
  };
  child.stdout.on('data', relay(process.stdout));
  child.stderr.on('data', relay(process.stderr));
  child.on('exit', (code) => console.log(`${prefix}stopped (${code ?? 'signal'}).`));
  return child;
});
process.on('SIGINT', () => {
  for (const child of children) {
    child.kill('SIGINT');
  }
});
