/*
 * The moments a bot acts on without being asked: the game itself calls on its faction, as it would call on a person.
 * Each cue has a key, so a moment wakes the bot once however many updates repeat it:
 * - a setup step for every seat or for its faction, until its seat is ready;
 * - its turn to bid;
 * - Revival, once a turn;
 * - its turn in Shipment and Movement;
 * - a battle marked where its faction is one of the two sides.
 * Everything else still waits for someone to write to it.
 */
import { MOVEMENT_PHASE_ID, movementOrder, nextToMove } from '../../src/shared/play/movement';
import { TABLE_PHASES } from '../../src/shared/play/phases';
import { setupStep } from '../../src/shared/play/setup';
import { stormOrder } from '../../src/shared/play/stormSector';
import type { BotView } from './view';

export type Cue = { key: string; reason: string };

/** The standard phase the table is in, or undefined during a faction's own declaration or before play. */
export function standardPhaseId(view: BotView): string | undefined {
  const snapshot = view.snapshot;
  if (!snapshot || (snapshot.stage && snapshot.stage !== 'play')) {
    return undefined;
  }
  const composed = snapshot.phases?.[snapshot.phase];
  if (composed) {
    return composed.kind === 'standard' ? composed.id : undefined;
  }
  return TABLE_PHASES[snapshot.phase]?.id;
}

/** What the game asks of this bot's faction right now; `turn` keeps a once-a-turn cue from firing again next turn. */
export function cuesFor(view: BotView, turn: number): Cue[] {
  const snapshot = view.snapshot;
  const me = view.factionId;
  const seat = view.current?.viewer.viewerSeat;
  if (!snapshot || !me) {
    return [];
  }
  const cues: Cue[] = [];
  const ready = (snapshot.controls?.ready ?? []).includes(seat ?? '');

  if (snapshot.stage === 'setup' && snapshot.setup) {
    const step = setupStep(snapshot.setup);
    const forMe = step && (!('factionId' in step) || !step.factionId || step.factionId === me);
    if (step && forMe && !ready) {
      cues.push({ key: `setup:${snapshot.setup.index}`, reason: `Setup step "${step.title}" needs you.` });
    }
    return cues;
  }

  const phase = standardPhaseId(view);
  const bidding = snapshot.bidding;
  if (phase === 'bidding' && bidding?.stage === 'open' && bidding.turn === me) {
    const high = bidding.bid ? `${view.factionName(bidding.bid.factionId)} bids ${bidding.bid.amount}` : 'no bid yet';
    cues.push({
      key: `bid:${turn}:${bidding.round}:${bidding.bid?.factionId ?? ''}:${bidding.bid?.amount ?? 0}`,
      reason: `Your turn to bid on card ${bidding.round} (${high}).`,
    });
  }
  if (phase === 'revival' && !ready) {
    cues.push({ key: `revival:${turn}`, reason: 'Revival: revive what you can or want to, then mark yourself ready.' });
  }
  if (phase === MOVEMENT_PHASE_ID) {
    const order = movementOrder(
      stormOrder(snapshot.table.stormSectorIndex, snapshot.roster, snapshot.table.pieces),
      snapshot.movement
    );
    if (nextToMove(order, snapshot.movement) === me) {
      cues.push({ key: `move:${turn}`, reason: 'Your turn to ship and move; mark your turn done when you finish.' });
    }
  }
  const battle = snapshot.battle;
  const side = battle?.sides.find((entry) => entry?.factionId === me);
  if (battle && side && battle.stage === 'preparing' && !side.ready) {
    const other = battle.sides.find((entry) => entry && entry.factionId !== me);
    cues.push({
      key: `battle:${battle.id}`,
      reason: `A battle in ${battle.territory}${other ? ` against ${view.factionName(other.factionId)}` : ''}: plan it.`,
    });
  }
  return cues;
}
