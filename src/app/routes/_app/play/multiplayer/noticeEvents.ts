import { MOVEMENT_PHASE_ID, movementOrder, nextToMove } from '@shared/play/movement';
import { phaseAt, STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { stormOrder } from '@shared/play/stormSector';

/** What happened to the viewer: their turn came up, they got paid or bribed, or were offered an alliance (#2981). */
export type SoftNoticeKind = 'bid' | 'ship' | 'battle' | 'spice' | 'alliance';

/** A soft notice the table's change raised for the viewer, before the page stamps when it arrived. */
export type NoticeDraft = Readonly<{
  /** Names the event, so the same one is never raised twice. */
  key: string;
  kind: SoftNoticeKind;
  /** The faction it came from: another for a payment or an offer, the viewer's own for their turn, or null for a gift whose giver the table did not record. */
  factionId: string | null;
  text: string;
  /** The table revision it happened at, which orders a batch that spans several. */
  revision: number;
}>;

type Names = Readonly<Record<string, string>>;

/**
 * What happened to the viewer's faction `own` between two live snapshots of the table, as soft notices (#2981).
 * Their turn to bid or to ship and move came up, their battle has both sides, another faction paid or bribed them, or offered an alliance.
 * The first snapshot a page sees raises none, since nothing happened while it watched.
 * Nor does a change the table has not made yet: the viewer's own drag of the movement order shows before the table answers, at the same revision.
 */
export function noticesBetween(
  before: GameSnapshot | undefined,
  after: GameSnapshot,
  own: string,
  names: Names,
  /** The battles the viewer's own claim completed in this step, which they made ready themselves. */
  ownCompleted: readonly string[] = []
): NoticeDraft[] {
  if (!before || before.revision === after.revision) {
    return [];
  }
  const name = (id: string) => names[id] ?? id;
  return [
    ...biddingTurn(before, after, own),
    ...movementTurn(before, after, own),
    ...battleReady(before, after, own, ownCompleted),
    ...spiceReceived(before, after, own, name),
    ...allianceOffers(before, after, own, name),
  ].toSorted((a, b) => a.revision - b.revision);
}

const bidUp = (snapshot: GameSnapshot, own: string) =>
  snapshot.bidding?.stage === 'open' && snapshot.bidding.turn === own;

/* A turn to bid names its round, so a round started afresh on the viewer is news, and takes the old round's notice with it. */
const bidKey = (snapshot: GameSnapshot) => `bid-${snapshot.bidding?.round}-`;

/* The viewer's turn to bid carried on from the snapshot before, in the same round. */
const stillBidding = (before: GameSnapshot, after: GameSnapshot, own: string) =>
  bidUp(before, own) && before.bidding?.round === after.bidding?.round;

function biddingTurn(before: GameSnapshot, after: GameSnapshot, own: string): NoticeDraft[] {
  if (!bidUp(after, own) || stillBidding(before, after, own)) {
    return [];
  }
  return [
    {
      key: `${bidKey(after)}${after.revision}`,
      kind: 'bid',
      factionId: own,
      text: 'Your turn to bid',
      revision: after.revision,
    },
  ];
}

/* The table records no movement turns until the first faction is done, so the phase itself says when movement is played. */
const shipUp = (snapshot: GameSnapshot, own: string) =>
  phaseAt(snapshot.phase, snapshot.phases ?? STANDARD_PHASES).id === MOVEMENT_PHASE_ID &&
  nextToMove(
    movementOrder(
      stormOrder(snapshot.table.stormSectorIndex, snapshot.roster, snapshot.table.pieces),
      snapshot.movement
    ),
    snapshot.movement
  ) === own;

/*
 * Whether the table's change to the movement turns was only a new order: same phase, nobody newly done.
 * Only such a change can be the viewer's own drag of the order confirmed; a faction finishing hands on a real turn.
 */
export const onlyReordered = (before: GameSnapshot, after: GameSnapshot) =>
  before.phase === after.phase &&
  (before.movement?.done ?? []).join() === (after.movement?.done ?? []).join() &&
  (before.movement?.order ?? []).join() !== (after.movement?.order ?? []).join();

/** Whether the room's movement order is exactly the one the viewer's own drag asked for. */
export const ownMovementOrder = (order: readonly string[] | null | undefined, after: GameSnapshot) =>
  order != null && order.join() === (after.movement?.order ?? []).join();

function movementTurn(before: GameSnapshot, after: GameSnapshot, own: string): NoticeDraft[] {
  if (!shipUp(after, own) || shipUp(before, own)) {
    return [];
  }
  return [
    {
      key: `ship-${after.revision}`,
      kind: 'ship',
      factionId: own,
      text: 'Your turn to ship and move',
      revision: after.revision,
    },
  ];
}

/*
 * The viewer's battle is ready for their plan once both its sides are claimed, one of them the viewer's.
 * When the viewer's own claim completed it, as the room answered that claim, they made it ready themselves, so there is nothing to tell them.
 */
/* The viewer's side of a battle, while it is planning and their plan is not yet Ready. */
const planning = (battle: GameSnapshot['battle'], own: string) =>
  battle?.stage === 'preparing' && battle.sides.some((side) => side?.factionId === own && !side.ready);

function battleReady(
  before: GameSnapshot,
  after: GameSnapshot,
  own: string,
  ownCompleted: readonly string[]
): NoticeDraft[] {
  const battle = after.battle;
  if (!battle || !battle.sides.every(Boolean) || !planning(battle, own) || ownCompleted.includes(battle.id)) {
    return [];
  }
  if (before.battle?.id === battle.id && before.battle.sides.every(Boolean)) {
    return [];
  }
  return [
    {
      key: `battle-${battle.id}`,
      kind: 'battle',
      factionId: own,
      text: `Your battle in ${battle.territory} is up`,
      revision: after.revision,
    },
  ];
}

function spiceReceived(
  before: GameSnapshot,
  after: GameSnapshot,
  own: string,
  name: (id: string) => string
): NoticeDraft[] {
  const seen = new Set((before.spiceTransfers ?? []).map((transfer) => transfer.revision));
  /* The table lists its transfers newest first; notices run oldest first, so the newest are the ones kept. */
  const transfers = (after.spiceTransfers ?? []).toSorted((a, b) => a.revision - b.revision);
  return transfers.flatMap((transfer) => {
    if (seen.has(transfer.revision) || transfer.destination !== own) {
      return [];
    }
    if (transfer.kind !== 'payment' && transfer.kind !== 'bribe') {
      return [];
    }
    /* The giver is the faction the room recorded with the gift, never a display name matched against today's seats; a gift recorded without one names nobody, and is never dropped. */
    const giver = transfer.giver === own ? undefined : transfer.giver;
    const verb = transfer.kind === 'bribe' ? 'bribed' : 'paid';
    const text = giver
      ? `${name(giver)} ${verb} you ${transfer.amount} spice`
      : `You were ${verb} ${transfer.amount} spice`;
    return [
      {
        key: `spice-${transfer.revision}`,
        kind: 'spice' as const,
        factionId: giver ?? null,
        text,
        revision: transfer.revision,
      },
    ];
  });
}

function allianceOffers(
  before: GameSnapshot,
  after: GameSnapshot,
  own: string,
  name: (id: string) => string
): NoticeDraft[] {
  const seen = new Set((before.alliances?.offers ?? []).map((offer) => offer.id));
  return (after.alliances?.offers ?? [])
    .filter((offer) => offer.to === own && !seen.has(offer.id))
    .map((offer) => ({
      key: `alliance-${offer.id}`,
      kind: 'alliance' as const,
      factionId: offer.from,
      text: `${name(offer.from)} offers you an alliance`,
      /* An offer's id is the revision that made it. */
      revision: offer.id,
    }));
}

const battlePlanning = (snapshot: GameSnapshot, own: string, key: string) =>
  planning(snapshot.battle, own) && key === `battle-${snapshot.battle?.id}`;

const offerOpen = (snapshot: GameSnapshot, key: string) =>
  (snapshot.alliances?.offers ?? []).some((offer) => key === `alliance-${offer.id}`);

/**
 * Whether what a notice announced still stands: a turn that has passed, a battle past its planning or already planned, or an alliance offer withdrawn or answered is no news any more.
 * Payments stay until they fade.
 */
export function noticeStillHolds(
  snapshot: GameSnapshot,
  own: string,
  notice: Pick<NoticeDraft, 'key' | 'kind'>
): boolean {
  switch (notice.kind) {
    case 'bid':
      return bidUp(snapshot, own) && notice.key.startsWith(bidKey(snapshot));
    case 'ship':
      return shipUp(snapshot, own);
    case 'battle':
      return battlePlanning(snapshot, own, notice.key);
    case 'alliance':
      return offerOpen(snapshot, notice.key);
    default:
      return true;
  }
}
