import { nextSnapshot } from '../../src/shared/play/commands';
import { emptyPublicControls } from '../../src/shared/play/inventory';
import { tableForViewer } from '../../src/shared/play/protocol';
import type { Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { SwapAction, SwapOffer, SwappingState } from '../../src/shared/play/swapping';
import { appendEvent, eventId } from '../../src/shared/play/tableState';
import type { ActorDirectory } from './actors';
import type { StoredSnapshot } from './state';

/** Every method runs inside the room's transaction, including occupancy, audit and command receipts. */
export class Swapping {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly actors: ActorDirectory
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS swap_audit (sequence INTEGER PRIMARY KEY, round TEXT NOT NULL, command_id TEXT NOT NULL, actor_id TEXT, affected_id TEXT, origin TEXT, target TEXT, offer_id TEXT, event_id TEXT NOT NULL, kind TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL)'
    );
  }

  apply(snapshot: StoredSnapshot, viewer: Viewer, action: SwapAction, commandId: string, now: number): StoredSnapshot {
    const state = snapshot.swapping;
    if (snapshot.stage !== 'swapping' || !state || state.closed || now >= state.deadline) {
      throw new GameRejection('Trading has ended.');
    }
    if (
      state.round !== action.round ||
      viewer.viewerSeat !== action.seat ||
      this.actors.seatFor(viewer.userId) !== action.seat ||
      action.seat === SPECTATOR_SEAT
    ) {
      throw new GameRejection('Your seat changed. Try the action again from the current table.');
    }
    const step = this.step(snapshot, commandId, now, viewer.userId);
    const seat = action.seat;
    if (action.kind === 'swap-ready') {
      step.state.ready = step.state.ready.filter((id) => id !== seat);
      if (action.ready) {
        step.state.ready.push(seat);
        step.expire((offer) => offer.origin === seat || offer.target === seat, 'readiness');
      }
      step.event(action.kind, `${seat} ${action.ready ? 'is ready' : 'is open to trading'}.`, seat);
    } else {
      if (step.state.ready.includes(seat)) {
        throw new GameRejection('Withdraw readiness before trading.');
      }
      if (action.kind === 'swap-offer') {
        const target = action.target;
        if (target === seat || !snapshot.roster?.seats.some((entry) => entry.id === target)) {
          throw new GameRejection('Choose a different seat at this table.');
        }
        if (step.state.ready.includes(target)) {
          throw new GameRejection('That player is ready and is not trading.');
        }
        if (step.state.offers.some((offer) => offer.origin === seat && offer.target === target)) {
          return snapshot;
        }
        const offer: SwapOffer = {
          id: `swap-${state.round}-${step.state.nextOrder}`,
          origin: seat,
          target,
          order: step.state.nextOrder++,
        };
        step.state.offers.push(offer);
        step.event('swap-offer', `${seat} offers to trade with ${target}.`, seat, target, offer.id);
        const reciprocal = step.state.offers.find((entry) => entry.origin === target && entry.target === seat);
        if (reciprocal) {
          step.move(offer, 'reciprocal');
        }
      } else {
        const offer = step.state.offers.find((entry) => entry.id === action.offerId);
        if (!offer) {
          throw new GameRejection('That offer is no longer open.');
        }
        if (action.kind === 'swap-cancel') {
          if (offer.origin !== seat) {
            throw new GameRejection('Only the player who made an offer can cancel it.');
          }
          step.state.offers = step.state.offers.filter((entry) => entry.id !== offer.id);
          step.event('swap-cancel', `${seat} cancelled the offer to ${offer.target}.`, seat, offer.target, offer.id);
        } else {
          if (offer.target !== seat) {
            throw new GameRejection('Only the player in the target seat can accept this offer.');
          }
          step.move(offer, 'accepted');
        }
      }
    }
    step.resolveVacancies();
    return this.finish(step.snapshot(), commandId, now, viewer.userId);
  }

  /** A departure, deletion or replacement settles its whole vacancy chain before another command can run. */
  reconcile(snapshot: StoredSnapshot, commandId: string, now: number): StoredSnapshot {
    if (!snapshot.swapping) {
      return snapshot;
    }
    const step = this.step(snapshot, commandId, now, null);
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
    if (!step.state.closed && now < step.state.deadline) {
      step.resolveVacancies();
    }
    return this.finish(step.snapshot(), commandId, now, null);
  }

  private finish(snapshot: StoredSnapshot, commandId: string, now: number, actor: string | null): StoredSnapshot {
    const step = this.step(snapshot, commandId, now, actor);
    const full = snapshot.roster?.seats.every((seat) => this.actors.holderOf(seat.id)) ?? false;
    if (
      !step.state.closed &&
      (now >= step.state.deadline || (full && this.actors.seats().every((seat) => step.state.ready.includes(seat))))
    ) {
      step.state.closed = true;
      step.expire(() => true, 'trading ended');
      step.event('swap-closed', full ? 'Trading ended.' : 'Trading ended. Waiting for approved replacements.');
    }
    /* Setup supply is a later delivery. The closed trading state retains assignments without opening unfinished setup controls. */
    return step.snapshot();
  }

  private step(snapshot: StoredSnapshot, commandId: string, now: number, actor: string | null) {
    const state: SwappingState = structuredClone(snapshot.swapping!);
    let next = snapshot;
    const event = (
      kind: string,
      reason: string,
      origin: string | null = null,
      target: string | null = null,
      offerId: string | null = null,
      affected: string | null = null
    ) => {
      const table = tableForViewer(next, SPECTATOR_SEAT);
      const id = eventId(table.nextEventNumber);
      next = nextSnapshot(next, {
        ...table,
        ...appendEvent(table, { id, command: kind, message: reason, status: 'accepted' }),
      });
      this.storage.sql.exec(
        'INSERT INTO swap_audit(round,command_id,actor_id,affected_id,origin,target,offer_id,event_id,kind,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        state.round,
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
    };
    const expire = (predicate: (offer: SwapOffer) => boolean, reason: string) => {
      for (const offer of state.offers.filter(predicate)) {
        event(
          'swap-expired',
          `Offer from ${offer.origin} to ${offer.target} expired: ${reason}.`,
          offer.origin,
          offer.target,
          offer.id
        );
      }
      state.offers = state.offers.filter((offer) => !predicate(offer));
    };
    const valid = (offer: SwapOffer) =>
      !!this.actors.holderOf(offer.origin) &&
      !state.ready.includes(offer.origin) &&
      !state.ready.includes(offer.target);
    const move = (offer: SwapOffer, reason: string) => {
      if (!valid(offer)) {
        throw new GameRejection('That offer is no longer valid.');
      }
      const from = this.actors.holderOf(offer.origin)!;
      const to = this.actors.holderOf(offer.target);
      /* The two writes and every following vacancy move share the enclosing storage transaction. */
      this.storage.sql.exec('UPDATE actors SET seat=? WHERE user_id=?', offer.target, from.userId);
      if (to) {
        this.storage.sql.exec('UPDATE actors SET seat=? WHERE user_id=?', offer.origin, to.userId);
      }
      event(
        'swap-move',
        `${offer.origin} ${to ? 'exchanged players with' : 'moved into'} ${offer.target}: ${reason}.`,
        offer.origin,
        offer.target,
        offer.id,
        from.userId
      );
      if (to) {
        event(
          'swap-move',
          `${offer.target} moved into ${offer.origin}: ${reason}.`,
          offer.target,
          offer.origin,
          offer.id,
          to.userId
        );
      }
      state.offers = state.offers.filter((entry) => entry.id !== offer.id);
      expire((entry) => entry.origin === offer.origin || (!!to && entry.origin === offer.target), 'player moved');
      state.ready = state.ready.filter((seat) => seat !== offer.origin && seat !== offer.target);
    };
    const resolveVacancies = () => {
      for (;;) {
        const earliest = state.offers
          .filter((offer) => valid(offer) && !this.actors.holderOf(offer.target))
          .sort((a, b) => a.order - b.order)[0];
        if (!earliest) {
          return;
        }
        move(earliest, 'automatic vacancy');
      }
    };
    return {
      state,
      event,
      expire,
      move,
      resolveVacancies,
      snapshot: (): StoredSnapshot => ({
        ...next,
        swapping: state,
        controls: { ...(next.controls ?? emptyPublicControls()), seats: this.actors.seats() },
      }),
    };
  }
}
