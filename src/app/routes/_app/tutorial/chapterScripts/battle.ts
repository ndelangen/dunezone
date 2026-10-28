import { isBattleLeader } from '@shared/play/battle';
import type { StoredPiece } from '@shared/play/model';
import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { at, element, onBoard, task } from './guideChecks';

/*
 * "Battle": one battle from the battle marker to an agreed result.
 * The learner plays the Fremen, and the others moved the game on to the Battle phase before the chapter opens.
 * The Fremen ship into Arrakeen, where House Atreides waits, drag the battle marker there and take the aggressor's side.
 * The Fremen fight because their troops carry battle values in the shared setup, and two troop types show what the dial is for.
 * The first battle teaches the leader, card, dial, Ready and agreed result. A second practice plan teaches early disclosure.
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
    const leader = (players.viewOf(seat).hand ?? []).find(isBattleLeader);
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
      ...fightsUntil(() => mySide() === 0 && Boolean(battle()?.sides[1])),
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
      id: 'card',
      task: 'Add a card to your plan',
      detail:
        'In the Cards row, choose Shield. Selected cards join the plan; choose one again to remove it. The table leaves card effects and the rules to the players.',
      anchor: { kind: 'page', element: element('[data-window="battle"] [aria-label="Put Shield into the plan"]') },
      begin: () => undefined,
      done: () => (plan()?.cardIds.length ?? 0) > 0,
    }),
    task({
      id: 'dial',
      task: 'Dial in two troops',
      detail:
        'Under the cards, the dial says how many troops you commit. Fremen troops come in two kinds, plain troops and Fedaykin, each with its own row: raise either by two. Keep the dial private for this battle. The eye beside it is for showing it early, which you will try after the result.',
      anchor: { kind: 'page', element: element('[data-window="battle"] [aria-label="Troops and spice"]') },
      begin: () => undefined,
      /* Clicking the eye first fixes the dial where it stands, so a shown dial moves the chapter on too, to its own step. */
      done: () =>
        (plan()?.troops ?? []).reduce((total, troop) => total + troop.dialed + troop.undialed, 0) >= 2 ||
        plan()?.disclosed.dial === true,
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
    task({
      id: 'practice-mark',
      task: 'Try early disclosure in another plan',
      detail:
        'The first battle is complete. For practice, drag the battle marker onto Arrakeen again. This time you will show the dial before locking the plan.',
      anchor: { kind: 'table', point: () => at(atreidesTroops()) },
      begin: () => undefined,
      done: () => Boolean(battle()),
    }),
    task({
      id: 'practice-claim',
      task: 'Claim your side again',
      detail: 'Claim the left side to open a fresh plan. Atreides takes the other side again.',
      anchor: { kind: 'page', element: element('[aria-label="Claim left side"]') },
      ...fightsUntil(() => mySide() === 0 && Boolean(battle()?.sides[1])),
    }),
    task({
      id: 'reveal-early',
      task: 'Show your dial early',
      detail:
        'Some cards and powers make a side show part of its plan before the reveal. Click the eye beside the dial: everyone now sees your dial on your closed wheel under the marker. Leaders and cards have an eye of their own.',
      anchor: {
        kind: 'page',
        element: element('[data-window="battle"] [aria-label="Show your dial to everyone now"]'),
      },
      begin: () => undefined,
      done: () => plan()?.disclosed.dial === true,
    }),
    task({
      id: 'practice-cancel',
      task: 'Cancel the practice battle',
      detail:
        'A shown part is fixed for the rest of that plan. Cards and leaders have their own eyes. Finish this practice by pressing Cancel battle under the marker.',
      anchor: {
        kind: 'page',
        element: () =>
          [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Cancel battle') ??
          null,
      },
      begin: () => undefined,
      done: () => !battle(),
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
  'The eye shows part of the plan early and fixes it for that battle',
];

/* A published Shield gives the learner a card to select in the plan. */
const hand: StoredPiece[] = [
  {
    id: 'tutorial-battle-shield',
    label: 'Shield',
    owner: '',
    color: '#d5ba8c',
    accent: '#ead9bb',
    items: [
      {
        id: 'tutorial-battle-shield-card',
        faceUp: true,
        artwork: {
          front: '{{origin}}/published/cards/ns7b716rp17wwzxzdpmjyyxy018cxchz/card.jpg',
          back: '{{origin}}/published/cardback-presets/treachery/cardback.jpg',
          backName: 'Treachery',
          name: 'Shield',
          type: 'card-treachery',
        },
      },
    ],
    stackKey: 'card:tutorial-battle-shield',
    position: [-25, 0, -25],
    orientation: 0,
    zoneId: null,
    locked: false,
    kind: 'card',
  },
];

export const battle: ChapterScript = {
  slug: 'battle',
  checkpoint: 'turn-1-storm',
  playAs: 'Fremen',
  hand,
  opening: (players) => {
    const seat = players.others()[0];
    for (let step = 0; seat && step < PHASES_TO_BATTLE; step++) {
      players.act(seat, { kind: 'phase' });
    }
  },
  tasks,
  learned,
};
