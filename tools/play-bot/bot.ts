/*
 * A bot that holds one seat in a Dune Play game. It sees exactly what a browser in that seat sees, wakes when a player
 * picks up its faction token, talks to it, or the bidding comes to it, and hands each wake to a brain (a language model
 * driven through the game tools below). Everything it does goes through the same messages a player's page sends,
 * so the room checks it exactly as it checks a human.
 */
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { z } from 'zod';

import { TABLE_CONVERSATION } from '../../src/shared/play/conversations';
import { factionTokenStackKey } from '../../src/shared/play/factionToken';
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
  think(prompt: string, bot: PlayBot): Promise<string>;
}

export type BotOptions = {
  brain: Brain;
  /** Where the bot keeps its private notes between wakes; they survive restarts. */
  notesFile?: string;
  /** Where the transcript goes, as Markdown. */
  transcriptFile?: string;
  /** A few lines on how this bot should play: its personality and strength. */
  style?: string;
  /** `all` wakes on every table message from another faction, `mentions` only when one names the bot's faction. */
  listen?: 'all' | 'mentions';
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

const commandSchema = (() => {
  const option = clientMessageSchema.options.find((entry) => entry.shape.type.value === 'command');
  if (!option) {
    throw new Error('The protocol has no command message.');
  }
  return (option.shape as unknown as { action: z.ZodDiscriminatedUnion<z.ZodObject[]> }).action;
})();

const ACTION_GROUPS: Record<string, string[]> = {
  'Turn and readiness': ['ready', 'phase', 'storm', 'last-turn'],
  Bidding: ['bid-start', 'bid-raise', 'bid-pass', 'bid-lower', 'bid-reset'],
  Battle: ['battle-start', 'battle-claim', 'battle-plan', 'battle-ready', 'battle-disclose', 'battle-outcome', 'battle-cancel'],
  'Cards in hand': ['hand-take', 'hand-play', 'hand-zone', 'hand-order', 'deck-draw', 'deck-shuffle', 'flip'],
  Alliances: ['alliance-offer', 'alliance-accept', 'alliance-withdraw', 'alliance-break'],
  'Shipment and Movement': ['movement-done', 'movement-undo'],
  Spice: ['bank-withdraw', 'bank-collect', 'spice-spawn', 'spice-blow'],
  Stacks: ['split', 'stack', 'rotate', 'lock'],
};

export class PlayBot {
  readonly view = new BotView();
  private readonly waiters = new Set<Waiter>();
  private readonly seenCarries = new Set<string>();
  private readonly moves: MoveRecord[] = [];
  private pendingReasons: string[] = [];
  private wakeTimer: ReturnType<typeof setTimeout> | undefined;
  private thinking = false;
  private chained = 0;
  private biddingKey: string | null = null;
  private askedSheets = false;
  private keepaliveTimer: ReturnType<typeof setInterval> | undefined;
  /** Resolves when the bot has nothing left to think about; tests and demos wait on it. */
  private idleWaiters: (() => void)[] = [];
  readonly tools: Tool[];

  constructor(
    private readonly transport: Transport,
    private readonly options: BotOptions
  ) {
    this.tools = this.buildTools();
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
      const named = new RegExp(`\\b(${me}|${this.view.factionName(me)}|bot)\\b`, 'iu').test(text);
      if (message.peerId !== TABLE_CONVERSATION || this.options.listen !== 'mentions' || named) {
        this.wake(`${author} wrote (${where}): "${text}"`);
      }
      return;
    }
    if (message.type === 'view' || message.type === 'update') {
      const view = this.view.current;
      const tokenKey = factionTokenStackKey(me);
      for (const carry of view?.carries ?? []) {
        if (
          carry.held.stackKey === tokenKey &&
          carry.connectionId !== view?.viewer.connectionId &&
          !this.seenCarries.has(carry.id)
        ) {
          this.seenCarries.add(carry.id);
          this.wake(`${carry.displayName} picked up your faction token: they want you to act now.`);
        }
      }
      const bidding = this.view.snapshot?.bidding;
      if (bidding?.stage === 'open' && bidding.turn === me) {
        const key = `${bidding.round}:${bidding.bid?.amount ?? 0}:${bidding.passed.join(',')}`;
        if (key !== this.biddingKey) {
          this.biddingKey = key;
          this.wake(`It is your turn to bid in bidding round ${bidding.round}.`);
        }
      }
    }
  }

  /* ---------------------------------------------------------------- waking */

  /** Queues a reason to think; reasons that arrive close together share one wake. */
  wake(reason: string) {
    this.log(`> Wake: ${reason}`);
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
      const answer = await this.options.brain.think(this.prompt(reasons), this);
      this.log(`\n> Brain finished in ${((Date.now() - started) / 1000).toFixed(1)} s: ${answer.trim() || '(no summary)'}\n`);
    } catch (error) {
      this.log(`> Brain failed: ${error instanceof Error ? error.message : String(error)}`);
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

  prompt(reasons: string[]): string {
    const me = this.view.factionId ?? 'unknown';
    return [
      'You are an AI player in a game of Dune (the Gale Force Nine board game), seated at a Dune Play table.',
      'Dune Play is a sandbox virtual table: it does not enforce the rules, the players do, and the factions and rules may be homebrew.',
      "Play to win as your faction, the way a strong human would: follow the phase, honour deals you make (or break them deliberately, as Dune allows), bluff when it helps, and keep private information private unless revealing it serves you.",
      this.options.style ? `Your play style: ${this.options.style}` : '',
      '',
      'How to work:',
      '- Act only through the dune tools. Start with `look` if the summary below is not enough.',
      '- Read the phase and the board to work out what is expected of you. If you are unsure, ask the table with `say` instead of guessing ("Sorry, I am not sure what you need from me here").',
      '- If a player tells you a move was not legal, use `undo_last_move` (or a correcting command), try again following their explanation, and record the ruling with `note` so you do not repeat it.',
      '- Use `note` for your private plans, deals, promises and what you believe others hold. Notes are only for you.',
      '- Keep chat short and in character. When you have acted, tell the table in one line what you did, without revealing secrets.',
      '- Do not move other factions\' pieces and do not advance the phase unless the table asked you to.',
      '',
      `Why you were woken:\n${reasons.map((reason) => `- ${reason}`).join('\n')}`,
      '',
      `Your private notes:\n${this.notes() || '(none yet)'}`,
      '',
      describeFaction(this.view, me),
      '',
      `Current state:\n${describeView(this.view)}`,
      '',
      `Recent chat:\n${describeChat(this.view)}`,
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

  async command(action: PieceAction): Promise<{ ok: boolean; message: string }> {
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
          const option = commandSchema.options.find(
            (entry) => (entry.shape as { kind?: z.ZodLiteral }).kind?.value === args.kind
          );
          return option
            ? JSON.stringify(z.toJSONSchema(option, { unrepresentable: 'any', io: 'input' }))
            : `No command "${args.kind}".`;
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
      return { text: result, isError: result.startsWith('REFUSED') };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`- \`${name}\` ${JSON.stringify(args ?? {})}\n  → error: ${message}`);
      return { text: message, isError: true };
    }
  }
}
