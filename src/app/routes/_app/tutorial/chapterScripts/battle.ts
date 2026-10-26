import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { at, element, onBoard, task } from './guideChecks';

/*
 * Chapter 15, "Battle": one battle from the battle marker to an agreed result.
 * The learner plays the Fremen, and the others moved the game on to the Battle phase before the chapter opens.
 * The Fremen ship into Arrakeen, where House Atreides waits, drag the battle marker there and take the aggressor's side.
 * The Fremen fight because their troops carry battle values in the shared setup, and two troop types show what the dial is for.
 * The plan goes together in the Battle plan window, the Ledger (#2498), which opens on the claim: a leader and a dial, then Ready.
 * Atreides answers on its own: it takes the other side, commits a leader and locks its plan, the plans reveal together,
 * and both sides agree who won. Nothing decides a battle for the players, so the result is theirs to agree on.
 */

/* Battle is the turn's seventh phase. */
const PHASES_TO_BATTLE = 6;
/* How long the other side thinks before each of its moves. */
const THINK_MS = 1200;
const OPPONENT = 'House Atreides';

/* The seat that plays a faction, among the other players. */
const seatOf = (players: TablePlayers, factionId: string) =>
  players.others().find((seat) => players.viewOf(seat).bank?.factionId === factionId);

/*
 * House Atreides' side of the battle while the task runs: it takes the right side once the learner took the left,
 * commits a leader and locks its plan once the learner locked theirs, and agrees to the result the learner chose.
 */
function atreidesFights(snapshot: () => GameSnapshot, players: TablePlayers) {
  const timer = setInterval(() => {
    const battle = snapshot().battle;
    const atreides = snapshot().roster?.seats.find((seat) => seat.faction?.name === OPPONENT)?.faction?.id;
    const seat = atreides && seatOf(players, atreides);
    if (!battle || !atreides || !seat) {
      return;
    }
    const [left, right] = battle.sides;
    if (left && !right) {
      players.act(seat, { kind: 'battle-claim', battleId: battle.id, side: 1 });
      return;
    }
    if (!left?.ready || !right || right.ready) {
      if (right && left?.choice && right.choice !== left.choice && battle.stage === 'revealed') {
        players.act(seat, { kind: 'battle-outcome', battleId: battle.id, outcome: left.choice });
      }
      return;
    }
    const leader = (players.viewOf(seat).hand ?? []).find((piece) => piece.kind === 'force');
    players.act(seat, {
      kind: 'battle-plan',
      battleId: battle.id,
      plan: { mode: 'custom', troops: [], spice: 0, adjustment: 0, leaderIds: leader ? [leader.id] : [], cardIds: [] },
    });
    players.act(seat, { kind: 'battle-ready', battleId: battle.id, ready: true });
  }, THINK_MS);
  return () => clearInterval(timer);
}

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const mine = () => snapshot().bank?.factionId ?? '';
  const pieces = () => snapshot().table.pieces.filter((piece) => !piece.inventory);
  const myTroopsOnBoard = () =>
    pieces()
      .filter((piece) => piece.stackKey?.startsWith(`troops:${mine()}:`) && onBoard(piece))
      .reduce((total, piece) => total + piece.items.length, 0);
  const myReserves = () => pieces().find((piece) => piece.stackKey?.startsWith(`troops:${mine()}:`) && !onBoard(piece));
  const battle = () => snapshot().battle;
  const mySide = () => battle()?.sides.findIndex((side) => side?.factionId === mine()) ?? -1;
  const plan = () => snapshot().battlePlan;
  const atreides = () => snapshot().roster?.seats.find((seat) => seat.faction?.name === OPPONENT)?.faction?.id;
  const atreidesTroops = () =>
    pieces().find((piece) => piece.stackKey?.startsWith(`troops:${atreides()}:`) && onBoard(piece));
  const fights = () => ({ stop: atreidesFights(snapshot, players) });
  const stops = (watch: { stop: () => void }) => watch.stop();
  return [
    task({
      id: 'ship',
      task: 'Ship troops into Arrakeen',
      detail:
        'You play the Fremen, and it is the Battle phase. Your reserves wait on the rim at your seat, where the arrow points. Drag troops onto Arrakeen, the city where the green Atreides troops stand.',
      anchor: { kind: 'table', point: () => at(myReserves()) },
      begin: myTroopsOnBoard,
      done: (start) => myTroopsOnBoard() > start,
    }),
    task({
      id: 'mark',
      task: 'Mark the battle',
      detail:
        'Two factions share a territory, so they fight. The battle marker waits on the phase tracker beside the Battle phase: drag it onto Arrakeen.',
      anchor: { kind: 'table', point: () => at(atreidesTroops()) },
      begin: () => undefined,
      done: () => Boolean(battle()),
    }),
    task({
      id: 'claim',
      task: 'Take the aggressor’s side',
      detail:
        'The battle asks who fights on which side. You attacked, so click Claim left side under the marker. Atreides takes the right side, and your battle plan opens on the left: {B} hides it and brings it back.',
      anchor: { kind: 'page', element: element('[aria-label="Claim left side"]') },
      ...fightsUntil(() => mySide() === 0),
    }),
    task({
      id: 'leader',
      task: 'Send a leader into battle',
      detail:
        'The plan is yours alone until both sides lock theirs. In the Leader row, click one of your leaders: its strength counts toward your total at the top.',
      anchor: { kind: 'page', element: element('[data-window="battle"] [aria-label="Leader"]') },
      begin: () => undefined,
      done: () => (plan()?.leaderIds.length ?? 0) > 0,
    }),
    task({
      id: 'dial',
      task: 'Dial in two troops',
      detail:
        'Under the cards, the dial says how many troops you commit. Fremen troops come in two kinds, plain troops and Fedaykin, each with its own row: raise either by two.',
      anchor: { kind: 'page', element: element('[data-window="battle"] [aria-label="Dial"]') },
      begin: () => undefined,
      done: () => (plan()?.troops ?? []).reduce((total, troop) => total + troop.dialed + troop.undialed, 0) >= 2,
    }),
    task({
      id: 'ready',
      task: 'Lock your plan',
      detail:
        'Press Ready for battle at the top of the plan. When both sides are ready, a short countdown runs and both plans show at once.',
      anchor: { kind: 'page', element: element('[aria-label="Ready for battle"]') },
      ...fightsUntil(() => battle()?.stage === 'revealed'),
    }),
    task({
      id: 'outcome',
      task: 'Agree who won',
      detail:
        'Compare the two plans under the marker, then click the side that won. The battle ends once both sides pick the same result.',
      anchor: { kind: 'page', element: element('[aria-label="Left side won"]') },
      ...fightsUntil(() => !battle() && (snapshot().battleResults?.length ?? 0) > 0),
    }),
  ];

  /* A task the other side plays along with while it runs. */
  function fightsUntil(done: () => boolean) {
    return { begin: fights, done, finish: stops };
  }
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Drag the battle marker from the phase tracker onto a contested territory',
  'Each faction claims a side; the aggressor takes the left',
  'Your battle plan opens with the claim, and {B} shows or hides it: a leader, cards and a dial',
  'Ready locks the plan, and both reveal together',
  'The players agree who won; the table never decides it for them',
];

export const battle: ChapterScript = {
  slug: 'battle',
  checkpoint: 'turn-1-storm',
  playAs: 'Fremen',
  opening: (players) => {
    const seat = players.others()[0];
    for (let step = 0; seat && step < PHASES_TO_BATTLE; step++) {
      players.act(seat, { kind: 'phase' });
    }
  },
  tasks,
  learned,
};
