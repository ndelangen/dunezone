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
  /** The faction it came from: another for a payment or an offer, the viewer's own for their turn. */
  factionId: string;
  text: string;
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
  names: Names
): NoticeDraft[] {
  if (!before || before.revision === after.revision) {
    return [];
  }
  const name = (id: string) => names[id] ?? id;
  return [
    ...biddingTurn(before, after, own),
    ...movementTurn(before, after, own),
    ...battleReady(before, after, own),
    ...spiceReceived(before, after, own, name),
    ...allianceOffers(before, after, own, name),
  ];
}

const bidUp = (snapshot: GameSnapshot, own: string) =>
  snapshot.bidding?.stage === 'open' && snapshot.bidding.turn === own;

function biddingTurn(before: GameSnapshot, after: GameSnapshot, own: string): NoticeDraft[] {
  if (!bidUp(after, own) || bidUp(before, own)) {
    return [];
  }
  return [{ key: `bid-${after.revision}`, kind: 'bid', factionId: own, text: 'Your turn to bid' }];
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

function movementTurn(before: GameSnapshot, after: GameSnapshot, own: string): NoticeDraft[] {
  if (!shipUp(after, own) || shipUp(before, own)) {
    return [];
  }
  return [{ key: `ship-${after.revision}`, kind: 'ship', factionId: own, text: 'Your turn to ship and move' }];
}

/*
 * The viewer's battle is ready for their plan once both its sides are claimed, one of them the viewer's.
 * When the viewer's own claim completes it, they made it ready themselves, so there is nothing to tell them.
 */
function battleReady(before: GameSnapshot, after: GameSnapshot, own: string): NoticeDraft[] {
  const ownSide = (battle: GameSnapshot['battle']) => battle?.sides.some((side) => side?.factionId === own) ?? false;
  const battle = after.battle;
  if (battle?.stage !== 'preparing' || !battle.sides.every(Boolean) || !ownSide(battle)) {
    return [];
  }
  const earlier = before.battle?.id === battle.id ? before.battle : undefined;
  if (earlier && (earlier.sides.every(Boolean) || !ownSide(earlier))) {
    return [];
  }
  return [
    { key: `battle-${battle.id}`, kind: 'battle', factionId: own, text: `Your battle in ${battle.territory} is up` },
  ];
}

/*
 * A transfer names the player who made it; the faction is the one their seat carries, where the table can tell.
 * A name two players share, or one no player carries any more, tells nothing.
 */
function playerFaction(snapshot: GameSnapshot, player: string): string | undefined {
  const seats = (snapshot.controls?.players ?? []).filter((entry) => entry.name === player);
  const seat = seats.length === 1 ? seats[0]?.seat : undefined;
  return snapshot.roster?.seats.find((entry) => entry.id === seat)?.faction?.id;
}

function spiceReceived(
  before: GameSnapshot,
  after: GameSnapshot,
  own: string,
  name: (id: string) => string
): NoticeDraft[] {
  const seen = new Set((before.spiceTransfers ?? []).map((transfer) => transfer.revision));
  return (after.spiceTransfers ?? []).flatMap((transfer) => {
    if (seen.has(transfer.revision) || transfer.destination !== own) {
      return [];
    }
    if (transfer.kind !== 'payment' && transfer.kind !== 'bribe') {
      return [];
    }
    const giver = playerFaction(after, transfer.actor);
    if (giver === own) {
      return [];
    }
    const verb = transfer.kind === 'bribe' ? 'bribed' : 'paid';
    const text = giver
      ? `${name(giver)} ${verb} you ${transfer.amount} spice`
      : `You were ${verb} ${transfer.amount} spice`;
    return [{ key: `spice-${transfer.revision}`, kind: 'spice' as const, factionId: giver ?? own, text }];
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
    }));
}

/**
 * Whether what a notice announced still stands: a turn that has passed, a battle past its planning, or an alliance offer withdrawn or answered is no news any more.
 * Payments stay until they fade.
 */
export function noticeStillHolds(
  snapshot: GameSnapshot,
  own: string,
  notice: Pick<NoticeDraft, 'key' | 'kind'>
): boolean {
  switch (notice.kind) {
    case 'bid':
      return bidUp(snapshot, own);
    case 'ship':
      return shipUp(snapshot, own);
    case 'battle':
      return snapshot.battle?.stage === 'preparing' && notice.key === `battle-${snapshot.battle.id}`;
    case 'alliance':
      return (snapshot.alliances?.offers ?? []).some((offer) => notice.key === `alliance-${offer.id}`);
    default:
      return true;
  }
}
