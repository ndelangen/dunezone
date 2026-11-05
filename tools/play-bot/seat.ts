/*
 * Takes one seat in a game on the local Play stack, as a person's page does: sign in as a stack account, get a seat pass,
 * open the game socket, ask for a seat and wait for the table to approve it. It never creates a game; it joins the one named.
 * `local.ts` runs one of these per process; the harness (`harness.ts`) runs several in one.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

import { KEEPALIVE_PING, KEEPALIVE_PONG } from '../../src/shared/play/protocol';
import type { ClientMessage, ServerMessage } from '../../src/shared/play/protocol';
import { PlayBot } from './bot';
import type { BotOptions, Brain, Transport } from './bot';
import { RULEBOOK_FILE } from './mirror';
import { Rulebook } from './rulebook';

export type Stack = {
  origin: string;
  backendUrl: string;
  /** The mirror the stack serves, when it serves one; its rulebook.md is what the bot's `rulebook` tool reads. */
  mirror?: string;
  accounts: { bot: { email: string; password: string }; bots?: { name: string; email: string; password: string }[] };
};

export const DEFAULT_STACK = path.join(import.meta.dirname, 'out/stack.json');

export function readStack(file = DEFAULT_STACK): Stack {
  return JSON.parse(readFileSync(file, 'utf8')) as Stack;
}

export type SeatOptions = {
  stack: Stack;
  /** The game page's URL, as the person's browser shows it. */
  game: string;
  /** Which of the stack's bot accounts, from 1. */
  account: number;
  /** Makes this seat's brain; `workdir` is a folder of the seat's own for the agent CLI. */
  brain: (workdir: string) => Brain;
  /** A particular open seat; by default the first nobody holds, or any while drafting. */
  seat?: string;
  /** Called when the game closes the connection. */
  onClose?: (code: number, reason: string) => void;
} & Pick<BotOptions, 'style' | 'listen' | 'maxWakes' | 'want'>;

export type Seat = {
  bot: PlayBot;
  /** The account's address before the @, which also names the bot's folder under out/bots. */
  id: string;
  name: string;
  gameId: string;
  stop: () => void;
};

export async function joinSeat(options: SeatOptions): Promise<Seat> {
  const { stack } = options;
  const account = (stack.accounts.bots ?? [{ name: 'bot', ...stack.accounts.bot }])[options.account - 1];
  if (!account) {
    throw new Error(`The stack has no bot account ${options.account}. Start it with --bots to create more.`);
  }
  const id = account.email.split('@')[0]!;
  const gameUrl = new URL(options.game, stack.origin);
  const address = decodeURIComponent(gameUrl.pathname.split('/').filter(Boolean).at(-1) ?? '');

  const convex = new ConvexHttpClient(stack.backendUrl, { logger: false });
  const signIn = async () => {
    const result = (await convex.action(anyApi.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: account.email, password: account.password },
    })) as { tokens?: { token: string } | null };
    if (!result.tokens?.token) {
      throw new Error(`${account.name}'s account could not sign in.`);
    }
    convex.setAuth(result.tokens.token);
  };
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
  const pass = async (first: boolean) => {
    const result = (await convex.mutation(first ? anyApi.playAdmission.enrolPlayer : anyApi.playAdmission.renewSeatPass, {
      gameId,
    })) as { ok: boolean; pass?: string; reason?: string };
    if (!result.ok || !result.pass) {
      throw new Error(`No seat pass for ${account.name}: ${result.reason ?? 'unknown'}.`);
    }
    return result.pass;
  };

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
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error(`Could not connect to ${socketUrl}.`)), { once: true });
  });

  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  /* Everything this bot keeps lives in its own directory; no other bot reads or writes it. */
  const out = path.join(import.meta.dirname, 'out/bots', id);
  /* The CLI runs outside the repository, so it finds no CLAUDE.md or AGENTS.md there, and in a directory of this bot's own. */
  const workdir = path.join(tmpdir(), 'dunezone-play-bot', id);
  mkdirSync(workdir, { recursive: true });
  mkdirSync(out, { recursive: true });
  const brain = options.brain(workdir);
  const rulebookFile = stack.mirror ? path.join(stack.mirror, RULEBOOK_FILE) : undefined;
  const rulebook = rulebookFile && existsSync(rulebookFile) ? new Rulebook(readFileSync(rulebookFile, 'utf8')) : undefined;
  const bot = new PlayBot(transport, {
    brain,
    name: account.name,
    /* One JSON line per wake, tool call and thought; `bun run play:bot:watch` shows every bot's file live. */
    eventsFile: path.join(out, 'events.jsonl'),
    rulebook,
    notesFile: path.join(out, `notes-${gameId}.md`),
    transcriptFile: path.join(out, `game-${stamp}.md`),
    style: options.style,
    listen: options.listen,
    maxWakes: options.maxWakes,
    want: options.want,
  });
  bot.log(`# ${access.name ?? gameId}: bot transcript (${brain.name}), ${new Date().toISOString()}\n`);
  bot.log(rulebook ? `Rulebook: ${rulebook.sections.length} sections from ${rulebookFile}.` : 'Rulebook: none copied.');
  /** A step on the way to the table: in the transcript, and as the status the launcher and watch page show. */
  const status = (state: 'connected' | 'asking' | 'seated' | 'playing', text: string) => {
    bot.log(text);
    bot.event({ kind: 'status', state, text });
  };
  status('connected', `Connected to ${access.name ?? gameId} with ${brain.name}.`);
  transport.send({ type: 'admit', pass: await pass(true) });

  /* Seat passes last an hour: sign in again and send a fresh one well before that. */
  const renewal = setInterval(
    () =>
      void (async () => {
        await signIn();
        transport.send({ type: 'pass', pass: await pass(false) });
      })().catch((error: unknown) => bot.log(`> Seat pass renewal failed: ${String(error)}`)),
    40 * 60_000
  );

  /* A game past its draft needs the seat named: the one asked for, else the first seat nobody holds. A drafting game takes any. */
  const openSeat = (view: NonNullable<typeof bot.view.current>) => {
    if (options.seat) {
      return options.seat;
    }
    if (view.snapshot.stage === 'drafting') {
      return undefined;
    }
    const held = view.snapshot.controls?.seats ?? [];
    return view.snapshot.roster?.seats.find((entry) => !held.includes(entry.id))?.id;
  };

  /* Once admitted, a bot without a seat asks for one and waits for the table to approve it. */
  let asking = false;
  let announced = false;
  const seating = setInterval(() => {
    const view = bot.view.current;
    if (!view) {
      return;
    }
    if (bot.view.factionId) {
      clearInterval(seating);
      const dealt = bot.view.factionName(bot.view.factionId);
      status('playing', `Dealt ${dealt}. Talk to it at the table or privately when you want it to act.`);
      return;
    }
    const hasSeat = view.snapshot.roster?.seats.some((entry) => entry.id === view.viewer.viewerSeat);
    if (hasSeat) {
      if (!announced) {
        announced = true;
        status('seated', `Seated at ${view.viewer.viewerSeat}; drafting${options.want ? ` ${options.want}` : ''} and waiting for the deal.`);
      }
      return;
    }
    const requested = view.snapshot.controls?.seatRequests.some((entry) => entry.own);
    if (!requested && !asking) {
      asking = true;
      const seat = openSeat(view);
      void bot.command({ kind: 'seat-request', ...(seat ? { seat } : {}) }).then((result) => {
        if (result.ok) {
          status('asking', 'Asked for a seat; approve it at the table.');
        } else {
          bot.log(`Seat request refused: ${result.message}`);
        }
        /* A refused request is tried again after a pause, in case a seat opens. */
        setTimeout(() => (asking = false), result.ok ? 0 : 15_000);
      });
    }
  }, 2000);

  const stop = () => {
    clearInterval(renewal);
    clearInterval(seating);
    bot.stop();
    socket.close(1000, 'Bot stopped');
  };
  socket.addEventListener('close', (event) => {
    clearInterval(renewal);
    clearInterval(seating);
    bot.log(`The game closed the connection (${event.code} ${event.reason}).`);
    options.onClose?.(event.code, event.reason);
  });
  return { bot, id, name: account.name, gameId, stop };
}
