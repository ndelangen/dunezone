import { movementOrder, nextToMove } from '@shared/play/movement';
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
 */
export function noticesBetween(
  before: GameSnapshot | undefined,
  after: GameSnapshot,
  own: string,
  names: Names
): NoticeDraft[] {
  if (!before) {
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

function biddingTurn(before: GameSnapshot, after: GameSnapshot, own: string): NoticeDraft[] {
  const up = (snapshot: GameSnapshot) => snapshot.bidding?.stage === 'open' && snapshot.bidding.turn === own;
  if (!up(after) || up(before)) {
    return [];
  }
  return [{ key: `bid-${after.revision}`, kind: 'bid', factionId: own, text: 'Your turn to bid' }];
}

function movementTurn(before: GameSnapshot, after: GameSnapshot, own: string): NoticeDraft[] {
  const up = (snapshot: GameSnapshot) =>
    snapshot.movement !== undefined &&
    nextToMove(
      movementOrder(
        stormOrder(snapshot.table.stormSectorIndex, snapshot.roster, snapshot.table.pieces),
        snapshot.movement
      ),
      snapshot.movement
    ) === own;
  if (!up(after) || up(before)) {
    return [];
  }
  return [{ key: `ship-${after.revision}`, kind: 'ship', factionId: own, text: 'Your turn to ship and move' }];
}

/* The viewer's battle is ready for their plan once both its sides are claimed, one of them the viewer's. */
function battleReady(before: GameSnapshot, after: GameSnapshot, own: string): NoticeDraft[] {
  const ready = (snapshot: GameSnapshot) => {
    const battle = snapshot.battle;
    return battle && battle.sides.every(Boolean) && battle.sides.some((side) => side?.factionId === own)
      ? battle
      : null;
  };
  const battle = ready(after);
  if (!battle || ready(before)?.id === battle.id) {
    return [];
  }
  return [
    { key: `battle-${battle.id}`, kind: 'battle', factionId: own, text: `Your battle in ${battle.territory} is up` },
  ];
}

/* A transfer names the player who made it; the faction is the one their seat carries, where the table can tell. */
function playerFaction(snapshot: GameSnapshot, player: string): string | undefined {
  const seat = snapshot.controls?.players.find((entry) => entry.name === player)?.seat;
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
    const from = giver ? name(giver) : transfer.actor;
    const text =
      transfer.kind === 'bribe'
        ? `${from} bribed you ${transfer.amount} spice`
        : `${from} paid you ${transfer.amount} spice`;
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
