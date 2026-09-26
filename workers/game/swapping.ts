import { accepted, nextSnapshot } from '../../src/shared/play/commands';
import { emptyPublicControls } from '../../src/shared/play/inventory';
import { tableForViewer } from '../../src/shared/play/protocol';
import type { Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { SwapAction, SwapOffer, SwappingState } from '../../src/shared/play/swapping';
import { eventId } from '../../src/shared/play/tableState';
import type { ActorDirectory } from './actors';
import type { PublicLog } from './log';
import type { SetupSupply } from './setup';
import type { StoredSnapshot } from './state';

/** Every method runs inside the room's transaction, including occupancy, audit and command receipts. */
export class Swapping {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly actors: ActorDirectory,
    private readonly supply: SetupSupply,
    private readonly log: PublicLog
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS swap_audit (sequence INTEGER PRIMARY KEY, round TEXT NOT NULL, command_id TEXT NOT NULL, actor_id TEXT, affected_id TEXT, origin TEXT, target TEXT, offer_id TEXT, event_id TEXT NOT NULL, kind TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL)'
    );
  }

  apply({ snapshot, viewer, action, commandId, now }: SwapCommand): StoredSnapshot {
    this.requireOpen(snapshot, now);
    this.requireCurrentSeat(snapshot.swapping!, viewer, action);
    const context = { commandId, now, actor: viewer.userId };
    const step = this.step(snapshot, context);
    if (action.kind === 'swap-ready') {
      step.setReady(action);
    } else {
      if (step.state.ready.includes(action.seat)) {
        throw new GameRejection('Withdraw readiness before trading.');
      }
      step.trade(action);
    }
    step.resolveVacancies();
    return this.finish(step.snapshot(), context);
  }

  private requireOpen(snapshot: StoredSnapshot, now: number) {
    const state = snapshot.swapping;
    if (snapshot.stage !== 'swapping' || !state) {
      throw new GameRejection('Trading has ended.');
    }
    if (state.closed || now >= state.deadline) {
      throw new GameRejection('Trading has ended.');
    }
  }

  private requireCurrentSeat(state: SwappingState, viewer: Viewer, action: SwapAction) {
    const currentSeat = this.actors.seatFor(viewer.userId);
    const sameAssignment = state.round === action.round && viewer.viewerSeat === action.seat;
    const actorCanTrade = currentSeat === action.seat && action.seat !== SPECTATOR_SEAT;
    if (!sameAssignment || !actorCanTrade) {
      throw new GameRejection('Your seat changed. Try the action again from the current table.');
    }
  }

  /** A departure, deletion or replacement settles its whole vacancy chain before another command can run. */
  reconcile(snapshot: StoredSnapshot, context: CommitContext): StoredSnapshot {
    if (!snapshot.swapping) {
      return snapshot;
    }
    const step = this.step(snapshot, context);
    const occupied = new Set(this.actors.seats());
    step.state.ready = step.state.ready.filter((seat) => occupied.has(seat));
    step.expire((offer) => !occupied.has(offer.origin), 'departure');
    if (snapshot.stage === 'discarded') {
      step.expire(() => true, 'discarded');
      step.state.closed = true;
      return step.snapshot();
    }
    if (snapshot.stage !== 'swapping') {
      return snapshot;
    }
    if (!step.state.closed && context.now < step.state.deadline) {
      step.resolveVacancies();
    }
    return this.finish(step.snapshot(), context);
  }

  /** Participation retains its public event; this row links that event to the swapping command and assignment. */
  recordParticipation({ before, after, commandId, actor, occupants, now }: ParticipationChange) {
    if (before.stage !== 'swapping' || !before.swapping) {
      return;
    }
    for (const move of this.occupancyChanges(occupants)) {
      this.participationEvent({ before, after, commandId, actor, occupants, now }, move);
    }
  }

  private occupancyChanges(occupants: ReturnType<ActorDirectory['seated']>) {
    const current = this.actors.seated();
    const previousSeats = new Map(occupants.map(({ userId, seat }) => [userId, seat]));
    const currentSeats = new Map(current.map(({ userId, seat }) => [userId, seat]));
    const users = new Set([...previousSeats.keys(), ...currentSeats.keys()]);
    return [...users]
      .map((userId) => ({
        userId,
        origin: previousSeats.get(userId) ?? null,
        target: currentSeats.get(userId) ?? null,
      }))
      .filter(({ origin, target }) => origin !== target);
  }

  private participationEvent(
    change: ParticipationChange,
    move: { userId: string; origin: string | null; target: string | null }
  ) {
    const { before, after, commandId, actor, now } = change;
    const { userId, origin, target } = move;
    const event = after.table.events[0];
    this.storage.sql.exec(
      'INSERT INTO swap_audit(round,command_id,actor_id,affected_id,origin,target,offer_id,event_id,kind,reason,created_at) VALUES(?,?,?,?,?,?,NULL,?,?,?,?)',
      before.swapping!.round,
      commandId,
      actor,
      this.actors.seatFor(userId) ? userId : null,
      origin,
      target,
      event?.id ?? '',
      target ? 'swap-replacement' : 'swap-departure',
      target ? `An approved replacement takes ${target}.` : `${origin} became vacant.`,
      now
    );
  }

  private finish(snapshot: StoredSnapshot, context: CommitContext): StoredSnapshot {
    const step = this.step(snapshot, context);
    const full = this.fullRoster(snapshot);
    const allReady = full && this.actors.seats().every((seat) => step.state.ready.includes(seat));
    const ended = context.now >= step.state.deadline || allReady;
    if (!step.state.closed && ended) {
      step.close(full);
    }
    const closed = step.snapshot();
    return full && step.state.closed ? this.supply.enter(closed, context.now) : closed;
  }

  private fullRoster(snapshot: StoredSnapshot) {
    return snapshot.roster?.seats.every((seat) => this.actors.holderOf(seat.id)) ?? false;
  }

  private step(snapshot: StoredSnapshot, context: CommitContext) {
    return new SwapStep(this.storage, this.actors, this.log, { snapshot, ...context });
  }
}

type SwapCommand = Readonly<{
  snapshot: StoredSnapshot;
  viewer: Viewer;
  action: SwapAction;
  commandId: string;
  now: number;
}>;
type ParticipationChange = Readonly<{
  before: StoredSnapshot;
  after: StoredSnapshot;
  commandId: string;
  actor: string | null;
  occupants: ReturnType<ActorDirectory['seated']>;
  now: number;
}>;
type CommitContext = Readonly<{ commandId: string; now: number; actor: string | null }>;
type StepContext = CommitContext & Readonly<{ snapshot: StoredSnapshot }>;

/** One mutable step owns offer changes, player movement and their audit inside the caller's transaction. */
class SwapStep {
  readonly state: SwappingState;
  private next: StoredSnapshot;
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly actors: ActorDirectory,
    private readonly log: PublicLog,
    private readonly context: StepContext
  ) {
    this.state = structuredClone(context.snapshot.swapping!);
    this.next = context.snapshot;
  }

  setReady(action: Extract<SwapAction, { kind: 'swap-ready' }>) {
    const seat = action.seat;
    this.state.ready = this.state.ready.filter((id) => id !== seat);
    if (action.ready) {
      this.state.ready.push(seat);
      this.expire((offer) => offer.origin === seat || offer.target === seat, 'readiness');
    }
    this.event(action.kind, `${seat} ${action.ready ? 'is ready' : 'is open to trading'}.`, { origin: seat });
  }

  trade(action: Exclude<SwapAction, { kind: 'swap-ready' }>) {
    if (action.kind === 'swap-offer') {
      this.offer(action);
      return;
    }
    const offer = this.state.offers.find((entry) => entry.id === action.offerId);
    if (!offer) {
      throw new GameRejection('That offer is no longer open.');
    }
    if (action.kind === 'swap-cancel') {
      this.cancel(offer, action.seat);
      return;
    }
    if (offer.target !== action.seat) {
      throw new GameRejection('Only the player in the target seat can accept this offer.');
    }
    this.move(offer, 'accepted');
  }

  private offer(action: Extract<SwapAction, { kind: 'swap-offer' }>) {
    const { seat, target } = action;
    this.requireTarget(seat, target);
    if (this.findOffer(seat, target)) {
      return;
    }
    const offer: SwapOffer = {
      id: `swap-${this.state.round}-${this.state.nextOrder}`,
      origin: seat,
      target,
      order: this.state.nextOrder++,
    };
    this.state.offers.push(offer);
    this.event('swap-offer', `${seat} offers to trade with ${target}.`, { origin: seat, target, offerId: offer.id });
    if (this.findOffer(target, seat)) {
      this.move(offer, 'reciprocal');
    }
  }

  private requireTarget(seat: string, target: string) {
    const exists = this.next.roster?.seats.some((entry) => entry.id === target);
    if (target === seat || !exists) {
      throw new GameRejection('Choose a different seat at this table.');
    }
    if (this.state.ready.includes(target)) {
      throw new GameRejection('That player is ready and is not trading.');
    }
  }

  private findOffer(origin: string, target: string) {
    return this.state.offers.find((offer) => offer.origin === origin && offer.target === target);
  }

  close(full: boolean) {
    this.state.closed = true;
    this.expire(() => true, 'trading ended');
    this.event('swap-closed', full ? 'Trading ended.' : 'Trading ended. Waiting for approved replacements.');
  }

  private cancel(offer: SwapOffer, seat: string) {
    if (offer.origin !== seat) {
      throw new GameRejection('Only the player who made an offer can cancel it.');
    }
    this.state.offers = this.state.offers.filter((entry) => entry.id !== offer.id);
    this.event('swap-cancel', `${seat} cancelled the offer to ${offer.target}.`, {
      origin: seat,
      target: offer.target,
      offerId: offer.id,
    });
  }

  event(
    kind: string,
    reason: string,
    {
      origin = null,
      target = null,
      offerId = null,
      affected = null,
    }: { origin?: string | null; target?: string | null; offerId?: string | null; affected?: string | null } = {}
  ) {
    const { commandId, now, actor } = this.context;
    const table = tableForViewer(this.next, SPECTATOR_SEAT);
    const id = eventId(table.nextEventNumber);
    this.next = nextSnapshot(this.next, accepted(table, kind, reason));
    this.storage.sql.exec(
      'INSERT INTO swap_audit(round,command_id,actor_id,affected_id,origin,target,offer_id,event_id,kind,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      this.state.round,
      commandId,
      actor,
      affected,
      origin,
      target,
      offerId,
      id,
      kind,
      reason,
      now
    );
  }
  expire(predicate: (offer: SwapOffer) => boolean, reason: string) {
    for (const offer of this.state.offers.filter(predicate)) {
      this.event('swap-expired', `Offer from ${offer.origin} to ${offer.target} expired: ${reason}.`, {
        origin: offer.origin,
        target: offer.target,
        offerId: offer.id,
      });
    }
    this.state.offers = this.state.offers.filter((offer) => !predicate(offer));
  }
  private valid(offer: SwapOffer) {
    return (
      !!this.actors.holderOf(offer.origin) &&
      !this.state.ready.includes(offer.origin) &&
      !this.state.ready.includes(offer.target)
    );
  }
  private move(offer: SwapOffer, reason: string) {
    if (!this.valid(offer)) {
      throw new GameRejection('That offer is no longer valid.');
    }
    const from = this.actors.holderOf(offer.origin)!;
    const to = this.actors.holderOf(offer.target);
    /* The two writes and every following vacancy move share the enclosing storage transaction. */
    this.storage.sql.exec('UPDATE actors SET seat=? WHERE user_id=?', offer.target, from.userId);
    this.log.recordSwap({
      offerId: offer.id,
      userId: from.userId,
      name: from.displayName,
      origin: offer.origin,
      target: offer.target,
    });
    if (to) {
      this.storage.sql.exec('UPDATE actors SET seat=? WHERE user_id=?', offer.origin, to.userId);
      this.log.recordSwap({
        offerId: offer.id,
        userId: to.userId,
        name: to.displayName,
        origin: offer.target,
        target: offer.origin,
      });
    }
    this.event(
      'swap-move',
      `${offer.origin} ${to ? 'exchanged players with' : 'moved into'} ${offer.target}: ${reason}.`,
      { origin: offer.origin, target: offer.target, offerId: offer.id, affected: from.userId }
    );
    if (to) {
      this.event('swap-move', `${offer.target} moved into ${offer.origin}: ${reason}.`, {
        origin: offer.target,
        target: offer.origin,
        offerId: offer.id,
        affected: to.userId,
      });
    }
    this.state.offers = this.state.offers.filter((entry) => entry.id !== offer.id);
    const movedSeats = new Set([offer.origin]);
    if (to) {
      movedSeats.add(offer.target);
    }
    this.expire((entry) => movedSeats.has(entry.origin), 'player moved');
    this.state.ready = this.state.ready.filter((seat) => seat !== offer.origin && seat !== offer.target);
  }
  resolveVacancies() {
    for (;;) {
      const earliest = this.earliestVacancyOffer();
      if (!earliest) {
        return;
      }
      this.move(earliest, 'automatic vacancy');
    }
  }
  private earliestVacancyOffer() {
    return this.state.offers
      .filter((offer) => this.valid(offer) && !this.actors.holderOf(offer.target))
      .sort((a, b) => a.order - b.order)[0];
  }

  snapshot(): StoredSnapshot {
    return {
      ...this.next,
      swapping: this.state,
      controls: { ...(this.next.controls ?? emptyPublicControls()), seats: this.actors.seats() },
    };
  }
}
