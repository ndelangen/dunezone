import {
  biddingCommandSchema,
  biddingIdentitySchema,
  initialBiddingRevisionStamps,
  parseBiddingSnapshot,
} from '@shared/tools/biddingSession';
import type {
  AuctionState,
  BiddingAction,
  BiddingCommand,
  BiddingContext,
  BiddingIdentity,
  BiddingResult,
  BiddingRevisionStamps,
  BiddingSnapshot,
} from '@shared/tools/biddingSession';

import { applyAuctionAction } from './auction';

const CENTRAL_SENDER = '@central';
const RECEIPTS_PER_SENDER = 128;
const MAX_SENDERS = 128;

export type SessionOptions = Readonly<{
  identity: BiddingIdentity;
  auction: AuctionState;
  assignments?: Readonly<Record<string, string>>;
  revision?: number;
}>;

/** The context belongs to capture time, so a delayed callback cannot acquire a later bidder. */
export function biddingContextOf(snapshot: BiddingSnapshot): BiddingContext {
  return {
    tableId: snapshot.tableId,
    centralInstanceId: snapshot.centralInstanceId,
    generation: snapshot.generation,
    opportunity: snapshot.auction.opportunity,
    revision: snapshot.revision,
  };
}

/** A remote keeps one pending command and retries its exact envelope until it receives a result. */
export function createBiddingCommand(
  snapshot: BiddingSnapshot,
  deviceId: string,
  action: BiddingAction,
  options: Readonly<{ commandId?: string; sequence?: number }> = {}
): BiddingCommand {
  return {
    ...biddingContextOf(snapshot),
    type: 'command',
    commandId: options.commandId ?? crypto.randomUUID(),
    sequence: options.sequence ?? (snapshot.commandSequences[deviceId] ?? 0) + 1,
    action,
  };
}

/* Field and claim stamps reject conflicts without making unrelated hands wait for one another. */
function changedRevisions(
  before: BiddingSnapshot,
  auction: AuctionState,
  assignments: Record<string, string>,
  configured: boolean
): BiddingRevisionStamps {
  const revision = before.revision + 1;
  const stamps = initialBiddingRevisionStamps(auction, revision, assignments);
  for (const seat of auction.seats) {
    const previous = before.auction.seats.find((candidate) => candidate.id === seat.id);
    const previousStamps = before.revisions.hands[seat.id];
    if (previous && previousStamps) {
      for (const field of ['hand', 'limit', 'full', 'pass'] as const) {
        const recalculatedFull = field === 'full' && (seat.hand !== previous.hand || seat.limit !== previous.limit);
        stamps.hands[seat.id][field] =
          previous[field] !== seat[field] || recalculatedFull ? revision : previousStamps[field];
      }
    }
    const priorHolder = Object.entries(before.assignments).find(([, factionId]) => factionId === seat.id)?.[0];
    const currentHolder = Object.entries(assignments).find(([, factionId]) => factionId === seat.id)?.[0];
    if (priorHolder === currentHolder && seat.id in before.revisions.factionClaims) {
      stamps.factionClaims[seat.id] = before.revisions.factionClaims[seat.id];
    }
  }
  stamps.deviceClaims = { ...before.revisions.deviceClaims };
  for (const deviceId of new Set([...Object.keys(before.assignments), ...Object.keys(assignments)])) {
    if (before.assignments[deviceId] !== assignments[deviceId]) {
      stamps.deviceClaims[deviceId] = revision;
    }
  }
  stamps.setup = configured ? revision : before.revisions.setup;
  return stamps;
}

/** The central device accepts every source synchronously against the same current snapshot. */
export class BiddingSession {
  private snapshot: BiddingSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly receipts = new Map<string, Map<number, BiddingResult>>();
  private readonly highWater = new Map<string, number>();
  private closed = false;

  constructor({ identity, auction, assignments = {}, revision = 0 }: SessionOptions) {
    const parsed = parseBiddingSnapshot({
      ...biddingIdentitySchema.parse({
        tableId: identity.tableId,
        code: identity.code,
        centralInstanceId: identity.centralInstanceId,
        generation: identity.generation,
      }),
      version: 1,
      revision,
      auction,
      assignments: { ...assignments },
      commandSequences: {},
      revisions: initialBiddingRevisionStamps(auction, revision, assignments),
    });
    if (!parsed) {
      throw new Error('The saved bidding table is incomplete or too large.');
    }
    this.snapshot = parsed;
  }

  getSnapshot = (): BiddingSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  captureContext = (): BiddingContext => biddingContextOf(this.snapshot);

  /** Closing an old central connection also fences local clicks and queued timers or recognition. */
  close(): void {
    this.closed = true;
    this.listeners.clear();
  }

  dispatch(action: BiddingAction, context: BiddingContext = this.captureContext()): BiddingResult {
    return this.process(CENTRAL_SENDER, {
      ...context,
      type: 'command',
      commandId: crypto.randomUUID(),
      sequence: (this.highWater.get(CENTRAL_SENDER) ?? 0) + 1,
      action,
    });
  }

  /** The transport supplies the admitted device identity; payloads never choose their actor. */
  receive(deviceId: string, input: unknown): BiddingResult {
    if (deviceId === CENTRAL_SENDER) {
      return this.result('invalid', false, 'That device identity is not allowed.');
    }
    return this.process(deviceId, input);
  }

  private result(commandId: string, accepted: boolean, reason: string): BiddingResult {
    return {
      type: 'result',
      commandId,
      accepted,
      reason,
      revision: this.snapshot.revision,
      opportunity: this.snapshot.auction.opportunity,
    };
  }

  private process(sender: string, input: unknown): BiddingResult {
    const parsed = biddingCommandSchema.safeParse(input);
    if (!parsed.success) {
      const commandId =
        typeof input === 'object' &&
        input !== null &&
        'commandId' in input &&
        typeof input.commandId === 'string' &&
        input.commandId.length > 0 &&
        input.commandId.length <= 160
          ? input.commandId
          : 'invalid';
      return this.result(commandId, false, 'That command is incomplete or invalid.');
    }
    const command = parsed.data;
    if (this.closed) {
      return this.result(command.commandId, false, 'This central connection has been replaced.');
    }
    if (
      command.tableId !== this.snapshot.tableId ||
      command.centralInstanceId !== this.snapshot.centralInstanceId ||
      command.generation !== this.snapshot.generation
    ) {
      return this.result(command.commandId, false, 'The table has changed. Synchronize before trying again.');
    }
    const previous = this.receipts.get(sender)?.get(command.sequence);
    if (previous) {
      return previous.commandId === command.commandId
        ? previous
        : this.result(command.commandId, false, 'That command sequence has already been used.');
    }
    if ([...(this.receipts.get(sender)?.values() ?? [])].some((result) => result.commandId === command.commandId)) {
      return this.result(command.commandId, false, 'That command identity has already been used.');
    }
    if (command.sequence <= (this.highWater.get(sender) ?? 0)) {
      return this.result(
        command.commandId,
        false,
        'That older command was already processed. Use the current table state.'
      );
    }
    if (!this.highWater.has(sender) && this.highWater.size >= MAX_SENDERS) {
      return this.result(
        command.commandId,
        false,
        'This table has reached its device limit. Recover into a new table to continue.'
      );
    }
    let accepted = false;
    let reason = '';
    let auction = this.snapshot.auction;
    let assignments = this.snapshot.assignments;
    const action = command.action;
    const factionId = sender === CENTRAL_SENDER ? auction.turn : assignments[sender];
    if (command.opportunity !== auction.opportunity) {
      reason = 'That bidding opportunity has ended.';
    } else if (command.revision > this.snapshot.revision) {
      reason = 'Synchronize with the table before trying again.';
    } else if (
      (action.type === 'edit-hand' || action.type === 'edit-status') &&
      (this.snapshot.revisions.hands[action.id]?.[action.field] ?? 0) > command.revision
    ) {
      reason = 'That hand setting changed. Check its current value and try again.';
    } else if (
      action.type === 'assign' &&
      ((this.snapshot.revisions.deviceClaims[sender] ?? 0) > command.revision ||
        (action.factionId !== null &&
          (this.snapshot.revisions.factionClaims[action.factionId] ?? 0) > command.revision))
    ) {
      reason = 'That faction assignment changed. Choose a faction again.';
    } else if (
      (action.type === 'configure' || action.type === 'finish-setup') &&
      (this.snapshot.revisions.setup > command.revision ||
        (action.type === 'configure' &&
          action.seats !== undefined &&
          Object.values(this.snapshot.revisions.hands).some((fields) =>
            Object.values(fields).some((revision) => revision > command.revision)
          )))
    ) {
      reason = 'Table setup or hand information changed. Check it before trying again.';
    } else if (sender !== CENTRAL_SENDER && action.type !== 'assign' && !factionId) {
      reason = 'Choose a faction before using this remote.';
    } else if (
      sender !== CENTRAL_SENDER &&
      (action.type === 'configure' || action.type === 'finish-setup' || action.type === 'pause')
    ) {
      reason = 'Use the central device for this table setting.';
    } else if (
      sender !== CENTRAL_SENDER &&
      (action.type === 'bid' || action.type === 'pass') &&
      factionId !== auction.turn
    ) {
      reason = "It is another faction's turn.";
    } else if (
      sender !== CENTRAL_SENDER &&
      (action.type === 'edit-hand' || action.type === 'edit-status') &&
      action.id !== factionId
    ) {
      reason = "This remote changes only its own faction's hand.";
    } else if (action.type === 'assign') {
      if (sender === CENTRAL_SENDER) {
        reason = 'Faction assignment belongs to a phone remote.';
      } else if (action.factionId !== null && !auction.seats.some((seat) => seat.id === action.factionId)) {
        reason = 'That faction is not at this table.';
      } else {
        assignments = Object.fromEntries(
          Object.entries(assignments).filter(([device, seat]) => device !== sender && seat !== action.factionId)
        );
        if (action.factionId !== null) {
          assignments[sender] = action.factionId;
        }
        accepted = true;
        reason = action.factionId === null ? 'The remote left its faction.' : 'The remote joined its faction.';
      }
    } else {
      const decision = applyAuctionAction(auction, action);
      accepted = decision.accepted;
      reason = decision.reason;
      auction = decision.state;
      if (accepted && action.type === 'configure') {
        assignments = Object.fromEntries(
          Object.entries(assignments).filter(([, seat]) => auction.seats.some((candidate) => candidate.id === seat))
        );
      }
    }
    const sequences = { ...this.snapshot.commandSequences, [sender]: command.sequence };
    let next = parseBiddingSnapshot({
      ...this.snapshot,
      revision: this.snapshot.revision + 1,
      auction,
      assignments,
      commandSequences: sequences,
      revisions: changedRevisions(this.snapshot, auction, assignments, accepted && action.type === 'configure'),
    });
    if (!next) {
      accepted = false;
      reason = 'This change would exceed the recovery copy limit. The table is unchanged.';
      next = parseBiddingSnapshot({
        ...this.snapshot,
        revision: this.snapshot.revision + 1,
        commandSequences: sequences,
      });
    }
    this.highWater.set(sender, command.sequence);
    if (next) {
      this.snapshot = next;
    }
    const result = this.result(command.commandId, accepted, reason);
    let receipts = this.receipts.get(sender);
    if (!receipts) {
      receipts = new Map();
      this.receipts.set(sender, receipts);
    }
    receipts.set(command.sequence, result);
    if (receipts.size > RECEIPTS_PER_SENDER) {
      receipts.delete(receipts.keys().next().value!);
    }
    if (next) {
      for (const listener of this.listeners) {
        listener();
      }
    }
    return result;
  }
}
