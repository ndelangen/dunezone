import {
  applyBidding,
  biddingFactions,
  BiddingRefusal,
  expireBid,
  idleBidding,
} from '../../src/shared/play/bidding';
import type { BiddingAction, BiddingState } from '../../src/shared/play/bidding';
import { nextSnapshot } from '../../src/shared/play/commands';
import { phaseAt } from '../../src/shared/play/phases';
import { tableForViewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { stormOrder } from '../../src/shared/play/stormSector';
import type { StoredSnapshot } from './state';

function context(snapshot: StoredSnapshot, now: number) {
  const { stormSectorIndex, pieces } = snapshot.table;
  return {
    order: stormOrder(stormSectorIndex, snapshot.roster),
    eligible: biddingFactions(stormSectorIndex, snapshot.roster, pieces),
    now,
  };
}

function commit(snapshot: StoredSnapshot, bidding: BiddingState): StoredSnapshot {
  return { ...nextSnapshot(snapshot, tableForViewer(snapshot, SPECTATOR_SEAT)), bidding };
}

/** Room supplies the acting faction; the bidder's time setting can change in any phase, the bidder itself only while bidding. */
export function biddingCommand(
  snapshot: StoredSnapshot,
  factionId: string,
  action: BiddingAction,
  now: number
): StoredSnapshot {
  if (action.kind !== 'bid-seconds' && phaseAt(snapshot.phase, snapshot.phases).id !== 'bidding') {
    throw new GameRejection('The bidder works only during the Bidding phase.');
  }
  try {
    return commit(snapshot, applyBidding(snapshot.bidding ?? idleBidding(), action, { ...context(snapshot, now), factionId }));
  } catch (error) {
    if (error instanceof BiddingRefusal) {
      throw new GameRejection(error.message);
    }
    throw error;
  }
}

/** The pass the bidder makes once a faction's time runs out. */
export function expireBidding(snapshot: StoredSnapshot, now: number): StoredSnapshot | undefined {
  if (!snapshot.bidding || phaseAt(snapshot.phase, snapshot.phases).id !== 'bidding') {
    return;
  }
  const next = expireBid(snapshot.bidding, context(snapshot, now));
  return next && commit(snapshot, next);
}

/** Leaving the phase puts the bidder away; the next Bidding phase starts again at its first round, with the same time. */
export function biddingAfterPhase(snapshot: StoredSnapshot, phase: number): Pick<StoredSnapshot, 'bidding'> {
  if (phase === snapshot.phase || !snapshot.bidding) {
    return {};
  }
  return { bidding: idleBidding(snapshot.bidding.seconds) };
}
