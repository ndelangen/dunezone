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
      task: 'Meet in Arrakeen',
      detail:
        "You're playing Fremen, and Atreides is waiting in Arrakeen. Let's set up a battle.\n\nDrag troops from your reserves into Arrakeen, where the green troops are standing.",
      anchor: { kind: 'table', point: () => at(myReserves()) },
      begin: myTroopsOnBoard,
      done: (start) => myTroopsOnBoard() > start,
    }),
    task({
      id: 'mark',
      task: 'Start the battle',
      detail:
        'Drag the battle marker from the Battle phase disc onto Arrakeen. That opens a battle for the two sides to claim.',
      anchor: { kind: 'table', point: () => at(atreidesTroops()) },
      begin: () => undefined,
      done: () => Boolean(battle()),
    }),
    task({
      id: 'claim',
      task: 'Take the aggressor side',
      detail:
        'Press Claim left side below the marker. Atreides will take the right side.\n\nYour battle plan opens on the left. Press {B} whenever you need to hide or reopen it.',
      anchor: { kind: 'page', element: element('[aria-label="Claim left side"]') },
      ...fightsUntil(() => mySide() === 0 && Boolean(battle()?.sides[1])),
    }),
    task({
      id: 'leader',
      task: 'Choose a leader',
      detail:
        'Who will lead your troops? Choose a leader in the Leader row. Their strength adds to your total.\n\nYour plan stays private until both sides are ready.',
      anchor: { kind: 'page', element: element('[data-window="battle"] [aria-label="Leader"]') },
      begin: () => undefined,
      done: () => (plan()?.leaderIds.length ?? 0) > 0,
    }),
    task({
      id: 'card',
      task: 'Add a card to your plan',
      detail:
        'Choose Shield in the Cards row. Click a selected card again to remove it.\n\nYou and your opponent apply the card effects yourselves.',
      anchor: { kind: 'page', element: element('[data-window="battle"] [aria-label="Put Shield into the plan"]') },
      begin: () => undefined,
      done: () => (plan()?.cardIds.length ?? 0) > 0,
    }),
    task({
      id: 'dial',
      task: 'Dial in two troops',
      detail:
        'Increase either the regular troop dial or the Fedaykin dial by two.\n\nLeave the eye button alone for now so your dial stays private.',
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
        'Happy with your plan? Press Ready for battle. Once both players are ready, a short countdown reveals the plans together.',
      anchor: { kind: 'page', element: element('[aria-label="Ready for battle"]') },
      ...fightsUntil(() => battle()?.stage === 'revealed'),
    }),
    task({
      id: 'outcome',
      task: 'Agree on the winner',
      detail:
        'Time to see how you did! Compare the plans and agree on the winner, then select the winning side below the marker.\n\nThe battle ends when you both choose the same result.',
      anchor: { kind: 'page', element: element('[aria-label="Left side won"]') },
      ...fightsUntil(() => !battle() && (snapshot().battleResults?.length ?? 0) > 0),
    }),
    task({
      id: 'practice-mark',
      task: 'Try an early reveal',
      detail:
        "Let's try one more battle. Drag the marker onto Arrakeen again.\n\nThis time you'll reveal your dial before locking your plan.",
      anchor: { kind: 'table', point: () => at(atreidesTroops()) },
      begin: () => undefined,
      done: () => Boolean(battle()),
    }),
    task({
      id: 'practice-claim',
      task: 'Claim your side again',
      detail: 'Press Claim left side again. Atreides will take the right side.',
      anchor: { kind: 'page', element: element('[aria-label="Claim left side"]') },
      ...fightsUntil(() => mySide() === 0 && Boolean(battle()?.sides[1])),
    }),
    task({
      id: 'reveal-early',
      task: 'Show your dial early',
      detail:
        'Some cards and powers require an early reveal.\n\nPress the eye beside your dial to make it public. Once revealed, it cannot change during this battle.\n\nLeaders and cards have their own eye buttons.',
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
      detail: 'Press Cancel battle below the marker to end this practice battle.',
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
