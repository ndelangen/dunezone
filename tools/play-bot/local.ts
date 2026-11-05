/*
 * Seats a bot in a game on the local Play stack (`bun run play:bot:stack`), signed in as the stack's bot account.
 *
 *   bun run play:bot -- --game http://127.0.0.1:PORT/play/<game> --brain claude
 *
 * It only ever joins the game you name: it never creates a game. Create the game yourself, then start the bot with its URL.
 * The bot asks for the open seat; approve its request at the table. Before factions are dealt it drafts and trades by fixed
 * rules (lobby.ts); from setup on it acts only when someone writes to it at the table or privately. Options:
 *   --brain claude|codex   which agent CLI thinks for it (default claude; it must be signed in on this machine)
 *   --model <name>         passed to that CLI
 *   --style "<text>"       its personality and strength, in a sentence or two
 *   --account <n>          which of the stack's bot accounts plays (1 by default); run one process per bot
 *   --listen all|mentions  wake on every table message, or only when named; by default `all` at a two-seat table and
 *                          `mentions` at a larger one, where bots would otherwise answer each other without end
 *   --max-wakes <n>        at most this many wakes in ten minutes (default 12), so no conversation runs away
 *   --seat <seat-id>       a particular open seat
 *   --want <faction>       the faction it drafts, and trades for if the deal gives it another
 *   --stack <file>         the stack file the launcher wrote (default tools/play-bot/out/stack.json)
 * Each bot is isolated: its transcript, private notes and event log live under tools/play-bot/out/bots/<account>/,
 * its CLI's working directory under the system's temporary folder, and nothing tells it which other seats are bots. It treats every player as a person.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

import { KEEPALIVE_PING, KEEPALIVE_PONG } from '../../src/shared/play/protocol';
import { RULEBOOK_FILE } from './mirror';
import { Rulebook } from './rulebook';
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
    listen: { type: 'string' },
    account: { type: 'string', default: '1' },
    'max-wakes': { type: 'string', default: '12' },
    seat: { type: 'string' },
    /* The faction you meant the bot to play; the game deals at random, so it warns when the deal went the other way. */
    want: { type: 'string' },
    stack: { type: 'string', default: path.join(import.meta.dirname, 'out/stack.json') },
  },
});
if (!values.game) {
  throw new Error('Pass --game with the game page URL from your browser.');
}
const stack = JSON.parse(readFileSync(values.stack!, 'utf8')) as {
  origin: string;
  backendUrl: string;
  /** The mirror the stack serves, when it serves one; its rulebook.md is what the bot's `rulebook` tool reads. */
  mirror?: string;
  accounts: { bot: { email: string; password: string }; bots?: { name: string; email: string; password: string }[] };
};
const accountIndex = Number(values.account) - 1;
const account = (stack.accounts.bots ?? [{ name: 'bot', ...stack.accounts.bot }])[accountIndex];
if (!account) {
  throw new Error(`The stack has no bot account ${values.account}. Start it with --bots to create more.`);
}
const gameUrl = new URL(values.game, stack.origin);
const address = decodeURIComponent(gameUrl.pathname.split('/').filter(Boolean).at(-1) ?? '');

const convex = new ConvexHttpClient(stack.backendUrl, { logger: false });
async function signIn() {
  const result = (await convex.action(anyApi.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email: account.email, password: account.password },
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
/* Everything this bot keeps lives in its own directory; no other bot reads or writes it. */
const out = path.join(import.meta.dirname, 'out/bots', account.email.split('@')[0]!);
/* The CLI runs outside the repository, so it finds no CLAUDE.md or AGENTS.md there, and in a directory of this bot's own. */
const workdir = path.join(tmpdir(), 'dunezone-play-bot', account.email.split('@')[0]!);
mkdirSync(workdir, { recursive: true });
mkdirSync(out, { recursive: true });
const brain =
  values.brain === 'codex' ? codexBrain({ model: values.model, workdir }) : claudeBrain({ model: values.model, workdir });
const rulebookFile = stack.mirror ? path.join(stack.mirror, RULEBOOK_FILE) : undefined;
const rulebook =
  rulebookFile && existsSync(rulebookFile) ? new Rulebook(readFileSync(rulebookFile, 'utf8')) : undefined;
const bot = new PlayBot(transport, {
  brain,
  name: account.name,
  /* One JSON line per wake, tool call and thought; `bun run play:bot:watch` shows every bot's file live. */
  eventsFile: path.join(out, 'events.jsonl'),
  rulebook,
  notesFile: path.join(out, `notes-${gameId}.md`),
  transcriptFile: path.join(out, `game-${stamp}.md`),
  style: values.style,
  listen: values.listen === 'mentions' || values.listen === 'all' ? values.listen : 'auto',
  maxWakes: Number(values['max-wakes']),
  want: values.want,
});
bot.log(`# ${access.name ?? gameId}: bot transcript (${brain.name}), ${new Date().toISOString()}\n`);
bot.log(rulebook ? `Rulebook: ${rulebook.sections.length} sections from ${rulebookFile}.` : 'Rulebook: none copied.');
bot.event({ kind: 'status', text: `Joined ${access.name ?? gameId} with ${brain.name}.` });
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

/* A game past its draft needs the seat named: the one asked for, else the first seat nobody holds. A drafting game takes any. */
function openSeat(view: NonNullable<typeof bot.view.current>) {
  if (values.seat) {
    return values.seat;
  }
  if (view.snapshot.stage === 'drafting') {
    return undefined;
  }
  const held = view.snapshot.controls?.seats ?? [];
  return view.snapshot.roster?.seats.find((entry) => !held.includes(entry.id))?.id;
}

/* Once admitted, a bot without a seat asks for one and waits for the table to approve it. */
let asking = false;
let announced = false;
const seated = setInterval(() => {
  const view = bot.view.current;
  if (!view) {
    return;
  }
  if (bot.view.factionId) {
    clearInterval(seated);
    const dealt = bot.view.factionName(bot.view.factionId);
    bot.log(`Dealt ${dealt}. Talk to it at the table or privately when you want it to act.`);
    return;
  }
  const hasSeat = view.snapshot.roster?.seats.some((entry) => entry.id === view.viewer.viewerSeat);
  if (hasSeat) {
    if (!announced) {
      announced = true;
      bot.log(`Seated at ${view.viewer.viewerSeat}; drafting${values.want ? ` ${values.want}` : ''} and waiting for the deal.`);
    }
    return;
  }
  const requested = view.snapshot.controls?.seatRequests.some((entry) => entry.own);
  if (!requested && !asking) {
    asking = true;
    const seat = openSeat(view);
    void bot.command({ kind: 'seat-request', ...(seat ? { seat } : {}) }).then((result) => {
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
