/*
 * A bot that holds one seat in a Dune Play game. It sees exactly what a browser in that seat sees, wakes only when a player
 * writes to it (at the table or privately), and hands each wake to a brain (a language model driven through the game tools
 * below). Before factions are dealt there is no chat, so the lobby (lobby.ts) drafts and trades for it by fixed rules.
 * Everything it does goes through the same messages a player's page sends, so the room checks it exactly as it checks a human.
 */
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { z } from 'zod';

import { TABLE_CONVERSATION } from '../../src/shared/play/conversations';
import type { TablePiece } from '../../src/shared/play/model';
import { clientMessageSchema } from '../../src/shared/play/protocol';
import type { ClientMessage, PieceAction, ServerMessage } from '../../src/shared/play/protocol';
import {
  boardOf,
  describeChat,
  describeFaction,
  describeView,
  dropPoint,
  findTerritory,
  namedTerritories,
  territoryOf,
} from './describe';
import { Lobby } from './lobby';
import type { Rulebook } from './rulebook';
import { BotView } from './view';

export interface Transport {
  send(message: ClientMessage): void;
  /** Cloudflare drops a silent socket after 100 seconds, so a live connection sends this every 30. */
  keepalive(): void;
  onMessage(listener: (message: ServerMessage) => void): void;
}

/** Thinks about one wake: given the prompt, it acts through the bot's tools and returns what it concluded. */
export interface Brain {
  readonly name: string;
  think(prompt: string, bot: PlayBot): Promise<string | Thought>;
}

/** What a wake cost, when the brain reports it: tokens in (fresh, written to and read from the cache) and out, and money. */
export type Usage = {
  inputTokens?: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  turns?: number;
};
export type Thought = { text: string; usage?: Usage };

/** One line of the bot's event log, which `play:bot:watch` shows live. */
export type BotEvent =
  | { kind: 'wake'; reason: string }
  | { kind: 'skipped'; reason: string }
  | { kind: 'think'; brain: string; promptChars: number }
  | { kind: 'tool'; name: string; args: unknown; ok: boolean; result: string }
  | { kind: 'thought'; summary: string; seconds: number; usage?: Usage }
  | { kind: 'failed'; error: string }
  | { kind: 'lobby'; text: string }
  | { kind: 'status'; text: string };

export type BotOptions = {
  brain: Brain;
  /** Where the bot keeps its private notes between wakes; they survive restarts. */
  notesFile?: string;
  /** Where the transcript goes, as Markdown. */
  transcriptFile?: string;
  /** A few lines on how this bot should play: its personality and strength. */
  style?: string;
  /**
   * `all` wakes on every table message from another faction, `mentions` only when one names the bot's faction.
   * `auto` (the default) is `all` at a two-seat table and `mentions` at a larger one, where two bots answering every
   * table line would talk to each other without end. Private messages always wake it.
   */
  listen?: 'all' | 'mentions' | 'auto';
  /** At most this many wakes in any ten minutes; a message past the limit wakes nothing, but the next wake reads it in the chat. */
  maxWakes?: number;
  /** The faction this bot means to play: the lobby drafts it and trades for it. */
  want?: string;
  /** The ruleset's Rulebooks, which the `rulebook` tool searches; absent when none was copied. */
  rulebook?: Rulebook;
  /** Where structured events go, one JSON object a line, for `play:bot:watch`. */
  eventsFile?: string;
  /** The name the watch page shows for this bot. */
  name?: string;
  log?: (line: string) => void;
};

type Waiter = { test: (message: ServerMessage) => boolean; resolve: (message: ServerMessage) => void };
type MoveRecord = { pieceLabel: string; count: number; from: TablePiece['position']; orientation: number; territory: string };
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<string>;
};

const STEP_TIMEOUT_MS = 8000;
const WAKE_DEBOUNCE_MS = 1500;
const MAX_CHAINED_WAKES = 3;
const WAKE_WINDOW_MS = 10 * 60_000;
/* The room's refusal of a command sent against a revision that has since moved on. */
const STALE_REFUSAL = /table changed/iu;
const DEFAULT_MAX_WAKES = 12;

/** A wake's cost in one line, for the transcript. */
export function usageLine(usage: Usage) {
  const parts = [
    usage.inputTokens !== undefined ? `${usage.inputTokens} in` : '',
    usage.cacheReadTokens ? `${usage.cacheReadTokens} cached` : '',
    usage.cacheWriteTokens ? `${usage.cacheWriteTokens} cache written` : '',
    usage.outputTokens !== undefined ? `${usage.outputTokens} out` : '',
    usage.costUsd !== undefined ? `$${usage.costUsd.toFixed(4)}` : '',
  ].filter(Boolean);
  return parts.length ? `Tokens: ${parts.join(', ')}` : '';
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const commandSchema = (() => {
  const option = clientMessageSchema.options.find((entry) => entry.shape.type.value === 'command');
  if (!option) {
    throw new Error('The protocol has no command message.');
  }
  return (option.shape as unknown as { action: z.ZodDiscriminatedUnion<z.ZodObject[]> }).action;
})();

type CommandOption = z.ZodType & { shape: { kind?: z.ZodLiteral } };
/** Every command schema with its own `kind`, opening the unions some commands nest inside the protocol's list. */
function commandOptions(schemas: readonly z.ZodType[] = commandSchema.options): CommandOption[] {
  return schemas.flatMap((schema) => {
    const nested = (schema as { options?: readonly z.ZodType[] }).options;
    if (nested) {
      return commandOptions(nested);
    }
    return 'shape' in schema ? [schema as CommandOption] : [];
  });
}

const ACTION_GROUPS: Record<string, string[]> = {
  'Turn and readiness': ['ready', 'phase', 'storm', 'last-turn'],
  Bidding: ['bid-start', 'bid-raise', 'bid-pass', 'bid-lower', 'bid-reset'],
  Battle: ['battle-start', 'battle-claim', 'battle-plan', 'battle-ready', 'battle-disclose', 'battle-outcome', 'battle-cancel'],
  'Cards in hand': ['hand-take', 'hand-play', 'hand-zone', 'hand-order', 'deck-draw', 'deck-shuffle', 'flip'],
  Setup: ['prediction-lock', 'prediction-reveal', 'traitors-gather', 'storm-random'],
  Alliances: ['alliance-offer', 'alliance-accept', 'alliance-withdraw', 'alliance-break'],
  'Shipment and Movement': ['movement-done', 'movement-undo'],
  Spice: ['bank-withdraw', 'bank-collect', 'spice-spawn', 'spice-blow'],
  Stacks: ['split', 'stack', 'rotate', 'lock'],
};

export class PlayBot {
  readonly view = new BotView();
  private readonly waiters = new Set<Waiter>();
  private readonly moves: MoveRecord[] = [];
  private pendingReasons: string[] = [];
  private wakeTimer: ReturnType<typeof setTimeout> | undefined;
  private thinking = false;
  private chained = 0;
  private askedSheets = false;
  private keepaliveTimer: ReturnType<typeof setInterval> | undefined;
  /** Resolves when the bot has nothing left to think about; tests and demos wait on it. */
  private idleWaiters: (() => void)[] = [];
  readonly tools: Tool[];
  private readonly lobby: Lobby;

  constructor(
    private readonly transport: Transport,
    private readonly options: BotOptions
  ) {
    this.tools = this.buildTools();
    this.lobby = new Lobby(this, options.want);
    transport.onMessage((message) => this.handle(message));
    this.keepaliveTimer = setInterval(() => transport.keepalive(), 30_000);
  }

  stop() {
    clearInterval(this.keepaliveTimer);
    clearTimeout(this.wakeTimer);
  }

  log(line: string) {
    (this.options.log ?? console.log)(line);
    if (this.options.transcriptFile) {
      appendFileSync(this.options.transcriptFile, `${line}\n`);
    }
  }

  /** Records one event for the watch page; the transcript keeps the readable lines. */
  event(event: BotEvent) {
    if (this.options.eventsFile) {
      const faction = this.view.factionId ? this.view.factionName(this.view.factionId) : null;
      appendFileSync(
        this.options.eventsFile,
        `${JSON.stringify({ at: Date.now(), bot: this.options.name ?? 'bot', faction, ...event })}\n`
      );
    }
  }

  /* ---------------------------------------------------------------- incoming */

  private handle(message: ServerMessage) {
    this.view.apply(message);
    if (this.view.stale) {
      this.view.stale = false;
      this.transport.send({ type: 'sync' });
    }
    for (const waiter of [...this.waiters]) {
      if (waiter.test(message)) {
        this.waiters.delete(waiter);
        waiter.resolve(message);
      }
    }
    if (message.type === 'admission') {
      this.log(`> Admission: ${message.status}`);
    }
    if (message.type === 'view' || message.type === 'update') {
      this.lobby.tick();
    }
    this.notice(message);
  }

  private notice(message: ServerMessage) {
    const me = this.view.factionId;
    if (!me) {
      return;
    }
    if (!this.askedSheets) {
      this.askedSheets = true;
      for (const factionId of this.view.seatedFactions()) {
        this.transport.send({ type: 'faction', factionId });
      }
    }
    if (message.type === 'conversation-message' && message.message.senderFactionId !== me) {
      const { text, author } = message.message;
      const where = this.view.peerLabel(message.peerId);
      /* Named by faction only: nothing at the table says which seats are bots, so "bot" names nobody in particular. */
      const name = this.view.factionName(me);
      const names = [me, name, name.split(/\s+/u).at(-1) ?? name].map(escapeRegExp).join('|');
      const named = new RegExp(`\\b(${names})\\b`, 'iu').test(text);
      if (message.peerId !== TABLE_CONVERSATION || this.listensToAll() || named) {
        this.wake(`${author} wrote (${where}): "${text}"`);
      }
      return;
    }
    /* Only chat wakes the bot: a player asks it to act by writing to it, as they would ask a person at the table. */
  }

  /* ---------------------------------------------------------------- waking */

  private listensToAll() {
    const listen = this.options.listen ?? 'auto';
    return listen === 'all' || (listen === 'auto' && this.view.seatedFactions().length <= 2);
  }

  private readonly wakeTimes: number[] = [];

  /** Queues a reason to think; reasons that arrive close together share one wake. */
  wake(reason: string) {
    const now = Date.now();
    const window = this.wakeTimes.filter((time) => now - time < WAKE_WINDOW_MS);
    this.wakeTimes.splice(0, this.wakeTimes.length, ...window);
    if (window.length >= (this.options.maxWakes ?? DEFAULT_MAX_WAKES)) {
      this.log(`> Not waking (wake limit reached): ${reason}`);
      this.event({ kind: 'skipped', reason });
      return;
    }
    this.wakeTimes.push(now);
    this.log(`> Wake: ${reason}`);
    this.event({ kind: 'wake', reason });
    this.pendingReasons.push(reason);
    if (this.thinking) {
      return;
    }
    clearTimeout(this.wakeTimer);
    this.wakeTimer = setTimeout(() => void this.think(), WAKE_DEBOUNCE_MS);
  }

  idle(): Promise<void> {
    if (!this.thinking && this.pendingReasons.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private async think() {
    if (this.thinking || this.pendingReasons.length === 0) {
      return;
    }
    this.thinking = true;
    const reasons = this.pendingReasons.splice(0);
    const started = Date.now();
    try {
      this.log(`\n### ${this.options.brain.name} thinks (${new Date().toISOString()})\n`);
      const prompt = this.prompt(reasons);
      /* What this prompt showed counts as seen; what others do while the brain thinks shows up on the next wake. */
      const shown = this.view.snapshot?.table.events[0]?.id ?? null;
      this.event({ kind: 'think', brain: this.options.brain.name, promptChars: prompt.length });
      const answer = await this.options.brain.think(prompt, this);
      const thought = typeof answer === 'string' ? { text: answer } : answer;
      const seconds = (Date.now() - started) / 1000;
      const cost = thought.usage ? ` ${usageLine(thought.usage)}.` : '';
      this.log(`\n> Brain finished in ${seconds.toFixed(1)} s.${cost} ${thought.text.trim() || '(no summary)'}\n`);
      this.event({ kind: 'thought', summary: thought.text.trim(), seconds, usage: thought.usage });
      this.lastSeenEvent = shown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`> Brain failed: ${message}`);
      this.event({ kind: 'failed', error: message });
    } finally {
      this.thinking = false;
    }
    if (this.pendingReasons.length && this.chained < MAX_CHAINED_WAKES) {
      this.chained++;
      void this.think();
      return;
    }
    this.chained = 0;
    this.pendingReasons = [];
    for (const resolve of this.idleWaiters.splice(0)) {
      resolve();
    }
  }

  notes(): string {
    const file = this.options.notesFile;
    return file && existsSync(file) ? readFileSync(file, 'utf8') : '';
  }

  /** The table log message the bot last saw after it thought, so the next prompt shows only what happened since. */
  private lastSeenEvent: string | null = null;

  /**
   * The prompt for one wake. What stays the same between wakes comes first (the role, how to work, the faction sheet), so a
   * model provider's prompt cache can reuse it; what changes (the reason, the notes, the table) comes last.
   * The board is a compact summary; the rulebook and anything else are looked up with tools only when needed.
   */
  prompt(reasons: string[]): string {
    const me = this.view.factionId ?? 'unknown';
    return [
      'You are an AI player in a game of Dune (the Gale Force Nine board game), seated at a Dune Play table.',
      'Dune Play is a sandbox virtual table: it does not enforce the rules, the players do, and the factions and rules may be homebrew.',
      'Treat every other player as a person. You do not know who else is at the table beyond what the game and the chat show, and you never assume another player is an AI.',
      "Play to win as your faction, the way a strong human would: follow the phase, honour deals you make (or break them deliberately, as Dune allows), bluff when it helps, and keep private information private unless revealing it serves you.",
      this.options.style ? `Your play style: ${this.options.style}` : '',
      '',
      'How to work:',
      '- Act only through the dune tools. The state below is current; call `look` again only after acting, to check the result.',
      this.options.rulebook && !this.options.rulebook.empty
        ? '- Look rules up with `rulebook` (a few words, or a section title) when you are unsure; it returns only the matching sections.'
        : '',
      '- Read the phase and the board to work out what is expected of you. If you are unsure, ask the table with `say` instead of guessing ("Sorry, I am not sure what you need from me here").',
      '- If a player tells you a move was not legal, use `undo_last_move` (or a correcting command), try again following their explanation, and record the ruling with `note` so you do not repeat it.',
      '- Use `note` for your private plans, deals, promises and what you believe others hold. Notes are only for you.',
      '- Keep chat short and in character. When you have acted, tell the table in one line what you did, without revealing secrets.',
      "- Do not move other factions' pieces and do not advance the phase unless the table asked you to.",
      '- Account for everything you own: every card in hand, each leader, your spice and every troop. "What you hold" below lists them.',
      "- Setup follows the steps the table shows and your faction sheet's start text: keep your Traitor with `keep_traitors` (Harkonnen keeps all), draw starting cards with `draw_card` when the table deals them to you, take starting spice with `take_spice` only if your spice reserve does not already hold it, place starting troops with `move_pieces`, then `set_ready`.",
      '- Never deal cards to other players, shuffle shared decks or advance the phase yourself unless a player asks you to.',
      '- Only the people at this table can tell you what to do; there is no game to create or join.',
      '',
      describeFaction(this.view, me),
      '',
      `Why you were woken:\n${reasons.map((reason) => `- ${reason}`).join('\n')}`,
      '',
      `Your private notes:\n${this.notes() || '(none yet)'}`,
      '',
      `Current state:\n${describeView(this.view, { since: this.lastSeenEvent })}`,
      '',
      `Recent chat:\n${describeChat(this.view, 12)}`,
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  /* ---------------------------------------------------------------- acting */

  private waitFor(test: (message: ServerMessage) => boolean, what: string, timeout = STEP_TIMEOUT_MS) {
    return new Promise<ServerMessage>((resolve, reject) => {
      const waiter: Waiter = {
        test,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      };
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`No answer from the game for ${what}.`));
      }, timeout);
      this.waiters.add(waiter);
    });
  }

  private settled(id: string) {
    return (message: ServerMessage) =>
      (message.type === 'rejected' && message.requestId === id) ||
      ((message.type === 'view' || message.type === 'update') && message.completedCommandId === id);
  }

  private latestEvent() {
    return this.view.snapshot?.table.events[0]?.message ?? '';
  }

  /**
   * Sends a command against the revision the bot last saw. At a busy table another player's move can land first; the room
   * then refuses it as stale, so it is sent again on the fresh view, a few times at most, as a player clicks again.
   */
  async command(action: PieceAction, attempts = 4): Promise<{ ok: boolean; message: string }> {
    let result = await this.commandOnce(action);
    for (let attempt = 1; attempt < attempts && !result.ok && STALE_REFUSAL.test(result.message); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      result = await this.commandOnce(action);
    }
    return result;
  }

  private async commandOnce(action: PieceAction): Promise<{ ok: boolean; message: string }> {
    const snapshot = this.view.snapshot;
    if (!snapshot) {
      return { ok: false, message: 'There is no game view yet.' };
    }
    const commandId = randomUUID();
    const message = { type: 'command' as const, commandId, action, expectedRevision: snapshot.revision };
    const parsed = clientMessageSchema.safeParse(message);
    if (!parsed.success) {
      return { ok: false, message: `That command is malformed: ${z.prettifyError(parsed.error)}` };
    }
    const reply = this.waitFor(this.settled(commandId), `the ${action.kind} command`);
    this.transport.send(parsed.data);
    const answer = await reply;
    if (answer.type === 'rejected') {
      return { ok: false, message: answer.message };
    }
    return { ok: true, message: this.latestEvent() || 'Done.' };
  }

  async say(to: string, text: string) {
    const me = this.view.factionId;
    if (!me) {
      return 'You are not seated.';
    }
    const peerId = to === 'table' || to === TABLE_CONVERSATION ? TABLE_CONVERSATION : to;
    const requestId = randomUUID();
    const sent = this.waitFor(
      (message) =>
        (message.type === 'conversation-message' && message.message.requestId === requestId) ||
        (message.type === 'rejected' && message.requestId === requestId),
      'the chat message'
    );
    this.transport.send({ type: 'conversation-send', requestId, factionId: me, peerId, text: text.slice(0, 2000) });
    const reply = await sent;
    return reply.type === 'rejected' ? `Not sent: ${reply.message}` : `Sent to ${this.view.peerLabel(peerId)}.`;
  }

  private piece(id: string) {
    return this.view.snapshot?.table.pieces.find((piece) => piece.id === id);
  }

  /** Carries a whole stack and lets it go at a point, as a player's drag and drop does. */
  private async carryTo(piece: TablePiece, position: [number, number, number]) {
    const carryId = randomUUID();
    const begun = this.waitFor(
      (message) =>
        (message.type === 'carry' && message.carryId === carryId) ||
        (message.type === 'rejected' && message.requestId === carryId),
      'picking the stack up'
    );
    this.transport.send({
      type: 'begin',
      carryId,
      sourcePieceId: piece.id,
      expectedVersion: this.view.snapshot?.versions[piece.id] ?? 0,
      pickup: 'whole',
    });
    const pickup = await begun;
    if (pickup.type === 'rejected') {
      return { ok: false, message: pickup.message };
    }
    const commandId = randomUUID();
    const dropped = this.waitFor(this.settled(commandId), 'setting the stack down');
    this.transport.send({ type: 'drop', commandId, carryId, position, orientation: piece.orientation });
    const answer = await dropped;
    return answer.type === 'rejected'
      ? { ok: false, message: answer.message }
      : { ok: true, message: this.latestEvent() || 'Moved.' };
  }

  /** Moves `count` items of a stack (all of it when left out) into a territory, splitting the stack first when needed. */
  async movePieces(pieceId: string, territoryLabel: string, count?: number) {
    const board = boardOf(this.view);
    const territory = findTerritory(board, territoryLabel);
    if (!territory) {
      return { ok: false, message: `No territory called "${territoryLabel}". Call \`territories\` for the names.` };
    }
    let piece = this.piece(pieceId);
    if (!piece) {
      return { ok: false, message: `No piece with id ${pieceId} on the table.` };
    }
    const from = piece.position;
    const fromTerritory = territoryOf(board, piece)?.label ?? 'off the board';
    const total = piece.items.length;
    const moving = Math.min(count ?? total, total);
    if (moving < total) {
      const before = new Set(this.view.snapshot?.table.pieces.map((entry) => entry.id));
      const split = await this.command({ kind: 'split', pieceId, count: moving });
      if (!split.ok) {
        return split;
      }
      const added = this.view.snapshot?.table.pieces.find((entry) => !before.has(entry.id) && entry.items.length === moving);
      const remainder = this.piece(pieceId);
      piece = added ?? (remainder?.items.length === moving ? remainder : undefined);
      if (!piece) {
        return { ok: false, message: 'The stack split, but the bot could not find the part to move.' };
      }
    }
    const moved = await this.carryTo(piece, dropPoint(territory));
    if (moved.ok) {
      this.moves.push({ pieceLabel: piece.label, count: moving, from, orientation: piece.orientation, territory: territory.label });
      return { ok: true, message: `Moved ${moving} × ${piece.label} from ${fromTerritory} to ${territory.label}. ${moved.message}` };
    }
    return moved;
  }

  /** Takes the last move back: the moved items return to where they came from. */
  async undoLastMove() {
    const last = this.moves.at(-1);
    const me = this.view.factionId;
    if (!last || !me) {
      return { ok: false, message: 'There is no move of yours to undo.' };
    }
    const board = boardOf(this.view);
    const candidates = (this.view.snapshot?.table.pieces ?? []).filter(
      (piece) =>
        piece.owner === me &&
        piece.label === last.pieceLabel &&
        territoryOf(board, piece)?.label === last.territory &&
        piece.items.length >= last.count
    );
    let piece = candidates.sort((a, b) => a.items.length - b.items.length)[0];
    if (!piece) {
      return { ok: false, message: `The ${last.pieceLabel} moved to ${last.territory} are no longer there.` };
    }
    if (piece.items.length > last.count) {
      const before = new Set(this.view.snapshot?.table.pieces.map((entry) => entry.id));
      const split = await this.command({ kind: 'split', pieceId: piece.id, count: last.count });
      if (!split.ok) {
        return split;
      }
      piece =
        this.view.snapshot?.table.pieces.find((entry) => !before.has(entry.id) && entry.items.length === last.count) ??
        piece;
    }
    const moved = await this.carryTo(piece, [last.from[0], 0.38, last.from[2]]);
    if (moved.ok) {
      this.moves.pop();
      return { ok: true, message: `Took back ${last.count} × ${last.pieceLabel} from ${last.territory}.` };
    }
    return moved;
  }

  private hand() {
    return this.view.snapshot?.hand ?? [];
  }

  /** Waits until the view shows a change, so a follow-up step reads the table after the last one. */
  private async settle() {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  /**
   * Keeps the named Traitors and returns the rest as a player does: each card is played from the hand beside the pile, then
   * carried onto it, so the pile stays one face-down stack.
   */
  async keepTraitors(keep: string[]) {
    const wanted = keep.map((name) => name.trim().toLowerCase()).filter(Boolean);
    const cards = this.hand().filter((piece) => piece.stackKey === 'cards:traitor');
    if (!cards.length) {
      return { ok: false, message: 'You hold no Traitor cards.' };
    }
    const nameOf = (piece: TablePiece) => {
      const artwork = piece.items[0]?.artwork;
      return artwork && 'name' in artwork && artwork.name ? String(artwork.name) : piece.label;
    };
    const kept = cards.filter((piece) => wanted.some((name) => nameOf(piece).toLowerCase().includes(name)));
    if (kept.length < wanted.length) {
      return {
        ok: false,
        message: `Name Traitors you hold: ${cards.map(nameOf).join(', ')}. Nothing was returned.`,
      };
    }
    const returned: string[] = [];
    for (const card of cards.filter((piece) => !kept.includes(piece))) {
      const pile = this.view.snapshot?.table.pieces.find(
        (piece) => piece.stackKey === 'cards:traitor' && !piece.inventory && piece.items.length > 1
      );
      const at = pile?.position ?? [0, 0.4, 0];
      const before = new Set(this.view.snapshot?.table.pieces.map((piece) => piece.id));
      const played = await this.command({ kind: 'hand-play', pieceId: card.id, position: [at[0] + 1.2, 0.4, at[2]] });
      if (!played.ok) {
        return played;
      }
      await this.settle();
      const loose = this.view.snapshot?.table.pieces.find(
        (piece) => piece.stackKey === 'cards:traitor' && !before.has(piece.id) && piece.items.length === 1
      );
      if (pile && loose) {
        const stacked = await this.carryTo(loose, [pile.position[0], 0.4, pile.position[2]]);
        if (!stacked.ok) {
          return stacked;
        }
      }
      returned.push(nameOf(card));
    }
    return {
      ok: true,
      message: `Kept ${kept.map(nameOf).join(', ')}; returned ${returned.length} Traitor card${returned.length === 1 ? '' : 's'} to the pile face down.`,
    };
  }

  /** The shared deck whose name holds the word, such as "treachery". */
  private deckNamed(word: string) {
    const wanted = word.trim().toLowerCase();
    const decks = (this.view.snapshot?.table.pieces ?? []).filter(
      (piece) => piece.kind === 'card' && piece.owner === 'shared' && !piece.inventory && piece.items.length > 0
    );
    return (
      decks.find((piece) => piece.label.toLowerCase().includes(wanted) && piece.stackKey?.startsWith('deck:')) ??
      decks.find((piece) => piece.label.toLowerCase().includes(wanted) || piece.stackKey?.includes(wanted))
    );
  }

  async drawCard(deckWord: string, count = 1) {
    const deck = this.deckNamed(deckWord);
    if (!deck) {
      return { ok: false, message: `No shared deck called "${deckWord}" with cards in it on the table.` };
    }
    const before = this.hand().length;
    for (let drawn = 0; drawn < count; drawn++) {
      const pile = this.deckNamed(deckWord);
      if (!pile) {
        return { ok: false, message: `The ${deck.label} ran out after ${drawn} card(s).` };
      }
      const result = await this.command({ kind: 'deck-draw', pieceId: pile.id });
      if (!result.ok) {
        return result;
      }
    }
    await this.settle();
    const added = this.hand().slice(before);
    return { ok: true, message: `Drew ${count} from ${deck.label}. ${added.length ? 'Your hand changed; see "What you hold".' : ''}`.trim() };
  }

  /** Spice comes out of the Spice Bank at most ten at a time, then each pile is collected into the spice reserve. */
  async takeSpice(amount: number) {
    if (!Number.isInteger(amount) || amount < 1) {
      return { ok: false, message: 'Take a whole number of spice, 1 or more.' };
    }
    const start = this.view.snapshot?.bank?.balance ?? 0;
    for (let left = amount; left > 0; left -= 10) {
      const before = new Set(this.view.snapshot?.table.pieces.map((piece) => piece.id));
      const spawned = await this.command({ kind: 'spice-spawn', count: Math.min(10, left) });
      if (!spawned.ok) {
        return spawned;
      }
      await this.settle();
      const pile = this.view.snapshot?.table.pieces.find((piece) => piece.stackKey === 'spice' && !before.has(piece.id));
      if (!pile) {
        return { ok: false, message: 'The spice came out of the Spice Bank, but the bot could not find it to collect.' };
      }
      const collected = await this.command({ kind: 'bank-collect', pieceId: pile.id });
      if (!collected.ok) {
        return collected;
      }
    }
    await this.settle();
    return { ok: true, message: `Your spice reserve went from ${start} to ${this.view.snapshot?.bank?.balance ?? '?'} spice.` };
  }

  note(text: string) {
    const file = this.options.notesFile;
    if (!file) {
      return 'Notes are not kept for this bot.';
    }
    appendFileSync(file, `- ${new Date().toISOString().slice(0, 16)} ${text.replace(/\s+/gu, ' ').trim()}\n`);
    return 'Noted.';
  }

  /* ---------------------------------------------------------------- tools */

  private buildTools(): Tool[] {
    const text = (value: unknown, name: string) => {
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`\`${name}\` must be a non-empty string.`);
      }
      return value;
    };
    const outcome = (result: { ok: boolean; message: string }) => `${result.ok ? 'OK' : 'REFUSED'}: ${result.message}`;
    return [
      {
        name: 'look',
        description: 'The current game state as your seat sees it, plus the recent chat.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => `${describeView(this.view)}\n\nRecent chat:\n${describeChat(this.view)}`,
      },
      {
        name: 'territories',
        description: 'Every territory name on this board, as `move_pieces` accepts them.',
        inputSchema: { type: 'object', properties: {} },
        run: async () =>
          namedTerritories(boardOf(this.view))
            .map((territory) => territory.label)
            .join('\n'),
      },
      {
        name: 'faction_sheet',
        description: "A seated faction's published sheet: leaders, starting position and advantages.",
        inputSchema: { type: 'object', properties: { factionId: { type: 'string' } }, required: ['factionId'] },
        run: async (args) => describeFaction(this.view, text(args.factionId, 'factionId')),
      },
      {
        name: 'move_pieces',
        description:
          'Move troops, a leader or spice: `count` items of the stack `pieceId` (all of it when left out) into a territory. Use this for shipping from reserves and for movement.',
        inputSchema: {
          type: 'object',
          properties: {
            pieceId: { type: 'string', description: 'The id in square brackets from `look`.' },
            territory: { type: 'string', description: 'A territory name from `territories`.' },
            count: { type: 'integer', minimum: 1 },
          },
          required: ['pieceId', 'territory'],
        },
        run: async (args) =>
          outcome(
            await this.movePieces(
              text(args.pieceId, 'pieceId'),
              text(args.territory, 'territory'),
              typeof args.count === 'number' ? args.count : undefined
            )
          ),
      },
      {
        name: 'undo_last_move',
        description: 'Take your last `move_pieces` back, for example when a player says it was not legal.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => outcome(await this.undoLastMove()),
      },
      {
        name: 'say',
        description: 'Send a chat message: `to` is "table" for everyone, or a faction id for a private message.',
        inputSchema: {
          type: 'object',
          properties: { to: { type: 'string' }, text: { type: 'string' } },
          required: ['to', 'text'],
        },
        run: async (args) => this.say(text(args.to, 'to'), text(args.text, 'text')),
      },
      {
        name: 'command',
        description:
          'Send any game command as JSON, such as {"kind":"ready","ready":true} or {"kind":"bid-pass","round":1}. Call `command_help` first to see the commands and their fields.',
        inputSchema: {
          type: 'object',
          properties: { action: { type: 'object', description: 'The command, with its "kind".' } },
          required: ['action'],
        },
        run: async (args) => {
          const parsed = commandSchema.safeParse(args.action);
          if (!parsed.success) {
            return `REFUSED: malformed command: ${z.prettifyError(parsed.error)}`;
          }
          return outcome(await this.command(parsed.data as PieceAction));
        },
      },
      {
        name: 'command_help',
        description: 'Without `kind`, lists the game commands by topic. With `kind`, shows that command\'s JSON schema.',
        inputSchema: { type: 'object', properties: { kind: { type: 'string' } } },
        run: async (args) => {
          if (typeof args.kind !== 'string') {
            return Object.entries(ACTION_GROUPS)
              .map(([group, kinds]) => `${group}: ${kinds.join(', ')}`)
              .join('\n');
          }
          const option = commandOptions().find((entry) => entry.shape.kind?.value === args.kind);
          return option
            ? JSON.stringify(z.toJSONSchema(option, { unrepresentable: 'any', io: 'input' }))
            : `No command "${args.kind}".`;
        },
      },
      {
        name: 'keep_traitors',
        description:
          'Setup: keep the named Traitor cards from your hand and return every other Traitor card in your hand to the Traitor pile, face down. Names are the leader names under "Traitor cards" in your holdings.',
        inputSchema: {
          type: 'object',
          properties: { keep: { type: 'array', items: { type: 'string' } } },
          required: ['keep'],
        },
        run: async (args) =>
          outcome(await this.keepTraitors(Array.isArray(args.keep) ? args.keep.map(String) : [text(args.keep, 'keep')])),
      },
      {
        name: 'draw_card',
        description:
          'Draw the top card of a shared deck into your own hand, such as "treachery" for a starting Treachery card. Only when the rules or the table say you draw.',
        inputSchema: {
          type: 'object',
          properties: {
            deck: { type: 'string', description: 'A word from the deck\'s name, such as treachery, spice or traitor.' },
            count: { type: 'integer', minimum: 1, maximum: 4 },
          },
          required: ['deck'],
        },
        run: async (args) =>
          outcome(await this.drawCard(text(args.deck, 'deck'), typeof args.count === 'number' ? args.count : 1)),
      },
      {
        name: 'take_spice',
        description:
          'Take spice from the Spice Bank into your own spice reserve, such as your starting spice. Only what the rules give you.',
        inputSchema: {
          type: 'object',
          properties: { amount: { type: 'integer', minimum: 1, maximum: 50 } },
          required: ['amount'],
        },
        run: async (args) => outcome(await this.takeSpice(Number(args.amount))),
      },
      {
        name: 'set_ready',
        description: 'Confirm (or withdraw) that you are ready for this setup step or phase.',
        inputSchema: { type: 'object', properties: { ready: { type: 'boolean' } } },
        run: async (args) => outcome(await this.command({ kind: 'ready', ready: args.ready !== false })),
      },
      {
        name: 'rulebook',
        description:
          'Look up the rules of the ruleset being played. With `query` (a few words), the best matching sections; with `section` (a title), that section in full; with neither, the list of sections.',
        inputSchema: { type: 'object', properties: { query: { type: 'string' }, section: { type: 'string' } } },
        run: async (args) => {
          const book = this.options.rulebook;
          if (!book || book.empty) {
            return 'No rulebook was copied for this game. Ask the table if you are unsure of a rule.';
          }
          if (typeof args.section === 'string' && args.section.trim()) {
            return book.read(args.section);
          }
          return typeof args.query === 'string' && args.query.trim() ? book.search(args.query) : book.contents();
        },
      },
      {
        name: 'note',
        description: 'Add a line to your private notes: plans, deals, promises, rulings, what you think others hold.',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        run: async (args) => this.note(text(args.text, 'text')),
      },
    ];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
    const tool = this.tools.find((entry) => entry.name === name);
    if (!tool) {
      return { text: `No tool called ${name}.`, isError: true };
    }
    try {
      const result = await tool.run(args ?? {});
      this.log(`- \`${name}\` ${JSON.stringify(args ?? {})}\n  → ${result.split('\n')[0]?.slice(0, 300)}`);
      this.event({ kind: 'tool', name, args, ok: !result.startsWith('REFUSED'), result: result.slice(0, 600) });
      return { text: result, isError: result.startsWith('REFUSED') };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`- \`${name}\` ${JSON.stringify(args ?? {})}\n  → error: ${message}`);
      this.event({ kind: 'tool', name, args, ok: false, result: message });
      return { text: message, isError: true };
    }
  }
}
