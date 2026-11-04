/*
 * Seats a bot in a game on the local Play stack (`bun run play:bot:stack`), signed in as the stack's bot account.
 *
 *   bun run play:bot -- --game http://127.0.0.1:PORT/play/<game> --brain claude
 *
 * The bot asks for the open seat; approve its request at the table. Options:
 *   --brain claude|codex   which agent CLI thinks for it (default claude; it must be signed in on this machine)
 *   --model <name>         passed to that CLI
 *   --style "<text>"       its personality and strength, in a sentence or two
 *   --listen all|mentions  wake on every table message (default) or only when named
 *   --seat <seat-id>       a particular open seat
 *   --stack <file>         the stack file the launcher wrote (default tools/play-bot/out/stack.json)
 * Its transcript and private notes go to tools/play-bot/out/.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

import { KEEPALIVE_PING, KEEPALIVE_PONG } from '../../src/shared/play/protocol';
import type { ClientMessage, ServerMessage } from '../../src/shared/play/protocol';
import { PlayBot } from './bot';
import type { Transport } from './bot';
import { claudeBrain, codexBrain } from './brains';

const { values } = parseArgs({
  options: {
    game: { type: 'string' },
    brain: { type: 'string', default: 'claude' },
    model: { type: 'string' },
    style: { type: 'string' },
    listen: { type: 'string', default: 'all' },
    seat: { type: 'string' },
    stack: { type: 'string', default: path.join(import.meta.dirname, 'out/stack.json') },
  },
});
if (!values.game) {
  throw new Error('Pass --game with the game page URL from your browser.');
}
const stack = JSON.parse(readFileSync(values.stack!, 'utf8')) as {
  origin: string;
  backendUrl: string;
  accounts: { bot: { email: string; password: string } };
};
const gameUrl = new URL(values.game, stack.origin);
const address = decodeURIComponent(gameUrl.pathname.split('/').filter(Boolean).at(-1) ?? '');

const convex = new ConvexHttpClient(stack.backendUrl, { logger: false });
async function signIn() {
  const result = (await convex.action(anyApi.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: stack.accounts.bot.email, password: stack.accounts.bot.password },
  })) as { tokens?: { token: string } | null };
  if (!result.tokens?.token) {
    throw new Error('The bot account could not sign in.');
  }
  convex.setAuth(result.tokens.token);
}
await signIn();
const access = (await convex.query(anyApi.playGameDirectory.getGameByAddress, { address })) as {
  status: string;
  gameId?: string;
  name?: string;
};
if (access.status !== 'ready' || !access.gameId) {
  throw new Error(`The game at ${address} is not open to join (${access.status}).`);
}
const gameId = access.gameId;
async function pass(first: boolean) {
  const result = (await convex.mutation(
    first ? anyApi.playAdmission.enrolPlayer : anyApi.playAdmission.renewSeatPass,
    { gameId }
  )) as { ok: boolean; pass?: string; reason?: string };
  if (!result.ok || !result.pass) {
    throw new Error(`No seat pass for the bot: ${result.reason ?? 'unknown'}.`);
  }
  return result.pass;
}

const socketUrl = new URL(`/__play/games/${encodeURIComponent(gameId)}/socket`, stack.origin);
socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
/* Bun's WebSocket takes headers; the game Worker checks the Origin like a browser's. */
const socket = new WebSocket(socketUrl, { headers: { Origin: stack.origin } } as unknown as string[]);
const listeners: ((message: ServerMessage) => void)[] = [];
const transport: Transport = {
  send: (message: ClientMessage) => socket.send(JSON.stringify(message)),
  keepalive: () => socket.send(KEEPALIVE_PING),
  onMessage: (listener) => listeners.push(listener),
};
socket.addEventListener('message', (event) => {
  if (typeof event.data === 'string' && event.data !== KEEPALIVE_PONG) {
    const message = JSON.parse(event.data) as ServerMessage;
    for (const listener of listeners) {
      listener(message);
    }
  }
});
socket.addEventListener('close', (event) => {
  console.log(`The game closed the connection (${event.code} ${event.reason}).`);
  process.exit(event.code === 1000 ? 0 : 1);
});
await new Promise<void>((resolve, reject) => {
  socket.addEventListener('open', () => resolve(), { once: true });
  socket.addEventListener('error', () => reject(new Error(`Could not connect to ${socketUrl}.`)), { once: true });
});

const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
const out = path.join(import.meta.dirname, 'out');
const brain =
  values.brain === 'codex' ? codexBrain({ model: values.model }) : claudeBrain({ model: values.model });
const bot = new PlayBot(transport, {
  brain,
  notesFile: path.join(out, `notes-${gameId}.md`),
  transcriptFile: path.join(out, `game-${stamp}.md`),
  style: values.style,
  listen: values.listen === 'mentions' ? 'mentions' : 'all',
});
bot.log(`# ${access.name ?? gameId}: bot transcript (${brain.name}), ${new Date().toISOString()}\n`);
transport.send({ type: 'admit', pass: await pass(true) });

/* Seat passes last an hour: sign in again and send a fresh one well before that. */
setInterval(
  () =>
    void (async () => {
      await signIn();
      transport.send({ type: 'pass', pass: await pass(false) });
    })().catch((error: unknown) => bot.log(`> Seat pass renewal failed: ${String(error)}`)),
  40 * 60_000
);

/* Once admitted, a bot without a seat asks for one and waits for the table to approve it. */
let asking = false;
const seated = setInterval(() => {
  const view = bot.view.current;
  if (!view) {
    return;
  }
  if (bot.view.factionId) {
    clearInterval(seated);
    bot.log(`Seated as ${bot.view.factionName(bot.view.factionId)}. Pick up its faction token or talk to it.`);
    return;
  }
  const requested = view.snapshot.controls?.seatRequests.some((entry) => entry.own);
  if (!requested && !asking) {
    asking = true;
    void bot
      .command({ kind: 'seat-request', ...(values.seat ? { seat: values.seat } : {}) })
      .then((result) => {
        bot.log(result.ok ? 'Asked for a seat; approve it at the table.' : `Seat request refused: ${result.message}`);
        /* A refused request is tried again after a pause, in case a seat opens. */
        setTimeout(() => (asking = false), result.ok ? 0 : 15_000);
      });
  }
}, 2000);

process.on('SIGINT', () => {
  bot.stop();
  socket.close(1000, 'Bot stopped');
});
