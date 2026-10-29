import { isBattleLeader } from '@shared/play/battle';
import { HIDDEN_ZONE_DEPTH, HIDDEN_ZONE_WIDTH } from '@shared/play/hiddenZone';
import type { StoredPiece, TablePiece } from '@shared/play/model';
import { phaseAt } from '@shared/play/phases';
import { CARD_DEPTH, CARD_WIDTH } from '@shared/play/tableGeometry';

import type { TablePlayers } from './chapterScript';
import { tableDeck } from './guideChecks';
import { ATREIDES_BATTLE_LOSS_COUNTER, KWISATZ_HADERACH } from './kwisatzHaderach';

/* The card's numbered track, measured in its published artwork. */
function counterAt(space: number) {
  const across = [-266, -93, 89, 268][(space - 1) % 4]!;
  const down = space <= 4 ? 260.5 : 440.5;
  return {
    x: 0.5 + ((across / 900) * CARD_WIDTH) / HIDDEN_ZONE_WIDTH,
    y: 0.5 + ((down / 1263) * CARD_DEPTH) / HIDDEN_ZONE_DEPTH,
  };
}

/** The private tracker exists before the first recorded checkpoint. */
export const recallHand: StoredPiece[] = [
  { ...KWISATZ_HADERACH, hiddenZone: { x: 0.5, y: 0.5 } },
  { ...ATREIDES_BATTLE_LOSS_COUNTER, hiddenZone: counterAt(1) },
];

type HistoryPlayers = Readonly<{ players: TablePlayers; seat: string; faction: string; seats: readonly string[] }>;
const view = ({ players, seat }: HistoryPlayers) => players.viewOf(seat);
const act = ({ players, seat }: HistoryPlayers, action: Parameters<TablePlayers['act']>[1]) =>
  players.act(seat, action);

function draw(context: HistoryPlayers, side: 'left' | 'right') {
  const before = view(context);
  const deck = tableDeck(() => before, side)!;
  const held = new Set(before.hand!.map((piece) => piece.id));
  act(context, { kind: 'deck-draw', pieceId: deck.id, recipient: context.faction });
  return view(context).hand!.find((piece) => !held.has(piece.id))!;
}

function play(context: HistoryPlayers, piece: TablePiece, position: [number, number, number]) {
  const before = new Set(view(context).table.pieces.map((piece) => piece.id));
  act(context, { kind: 'hand-play', pieceId: piece.id, position });
  const played = view(context).table.pieces.find((piece) => !before.has(piece.id))!;
  act(context, { kind: 'flip', pieceId: played.id });
}

function storm(context: HistoryPlayers, turn: number) {
  for (let step = 0; step < turn + 1; step++) {
    act(context, { kind: 'storm', direction: 1 });
  }
}

function spiceBlow(context: HistoryPlayers, turn: number) {
  play(context, draw(context, 'right'), [15 + turn * 2, 0, 1]);
  act(context, { kind: 'spice-spawn', count: 2 + turn });
}

function bidding(context: HistoryPlayers) {
  draw(context, 'left');
  draw(context, 'left');
  act(context, { kind: 'bank-withdraw', amount: 2 });
}

function movement(context: HistoryPlayers, turn: number) {
  const leader = view(context).hand!.find((piece) => !piece.hiddenZone && isBattleLeader(piece))!;
  play(context, leader, [-3 + turn * 3, 0, 4]);
  act(context, { kind: 'movement-done', factionId: context.faction });
  const other = view(context).roster!.seats.find((seat) => seat.faction && seat.faction.id !== context.faction)!;
  act(context, { kind: 'movement-done', factionId: other.faction!.id });
}

function battle(context: HistoryPlayers, turn: number) {
  const hand = view(context).hand!;
  const card = hand.find((piece) => piece.items.some((item) => item.artwork?.type === 'card-treachery'))!;
  play(context, card, [-18 - turn * 2, 0, 1]);
  const counter = view(context).hand!.find((piece) => piece.label === ATREIDES_BATTLE_LOSS_COUNTER.label)!;
  act(context, { kind: 'hand-zone', pieceId: counter.id, at: counterAt(turn === 1 ? 3 : 6) });
}

function collection(context: HistoryPlayers) {
  const leader = view(context).table.pieces.find((piece) => isBattleLeader(piece) && piece.owner === context.faction)!;
  act(context, { kind: 'hand-take', pieceId: leader.id });
}

function playTurn(context: HistoryPlayers, turn: number) {
  const phases = view(context).phases!;
  const actions: Record<string, () => void> = {
    storm: () => storm(context, turn),
    'spice-blow': () => spiceBlow(context, turn),
    bidding: () => bidding(context),
    'shipment-and-movement': () => movement(context, turn),
    battle: () => battle(context, turn),
    'spice-collection': () => collection(context),
  };
  for (let index = 0; index < phases.length; index++) {
    const phase = phaseAt(view(context).phase, phases);
    actions[phase.id]?.();
    if (phase.allPlayersMustBeReady) {
      context.seats.forEach((seat) => context.players.act(seat, { kind: 'ready', ready: true }));
    }
    act(context, { kind: 'phase' });
  }
}

/** Two completed turns and the next storm, recorded through the same commands as a real table. */
export function openRecallHistory(players: TablePlayers) {
  const roster = players.viewOf(players.others()[0]!).roster!;
  const learner = roster.seats.find((seat) => seat.faction?.name === 'House Atreides')!;
  const context = {
    players,
    seat: learner.id,
    faction: learner.faction!.id,
    seats: roster.seats.map((seat) => seat.id),
  };
  playTurn(context, 1);
  playTurn(context, 2);
  storm(context, 3);
  act(context, { kind: 'phase' });
}
