import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { element, nextPhaseButton, phaseOf, task } from './guideChecks';

/*
 * "Phases and turns": the turn as the header runs it, from the Storm round to the next turn's Storm.
 * Next phase moves on and its menu steps back; the Mentat Pause waits until every player says Ready, and then a new turn starts.
 * The other players ready up by themselves once the learner reaches the pause, so the count beside Ready climbs as it does in a game.
 * What else holds a phase, an open battle, is the Battle chapter's.
 */

/* How long apart the other players say they are ready, so the count beside Ready climbs one player at a time. */
const READY_GAP_MS = 700;

/* The other players say they are ready one after another, once the task starts; the timers stop if it ends first. */
const othersReadyUp = (players: TablePlayers) => {
  const timers = players
    .others()
    .map((seat, index) =>
      setTimeout(() => players.act(seat, { kind: 'ready', ready: true }), (index + 1) * READY_GAP_MS)
    );
  return () => timers.forEach(clearTimeout);
};

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const phase = () => phaseOf(snapshot);
  return [
    task({
      id: 'back',
      task: 'Step back to the Storm',
      detail:
        'The game just advanced to Spice Blow. Open the arrow beside Next phase and choose Previous phase to return to Storm.',
      anchor: { kind: 'page', element: element('[aria-label="More phase actions"]') },
      begin: () => undefined,
      done: () => phase().id === 'storm',
    }),
    task({
      id: 'to-pause',
      task: 'Advance to Mentat Pause',
      detail: 'Keep pressing Next phase until you reach Mentat Pause, the last phase of the turn.',
      anchor: { kind: 'page', element: nextPhaseButton },
      begin: () => undefined,
      done: () => phase().id === 'mentat-pause',
    }),
    task({
      id: 'ready',
      task: 'Ready for the next turn',
      detail:
        'Mentat Pause waits for everyone to be ready. Press Ready. The count shows how many players have confirmed.',
      anchor: {
        kind: 'page',
        element: () =>
          [...document.querySelectorAll('[aria-label="Phase navigation"] button')].find((button) =>
            button.textContent?.startsWith('Ready')
          ) ?? null,
      },
      begin: () => ({ stop: othersReadyUp(players) }),
      done: () => (snapshot().controls?.seats ?? []).every((seat) => snapshot().controls?.ready.includes(seat)),
      finish: (watch: { stop: () => void }) => watch.stop(),
    }),
    task({
      id: 'turn-2',
      task: 'Start turn 2',
      detail: 'Now that everyone is ready, press Next phase to start the Storm phase of turn 2.',
      anchor: { kind: 'page', element: nextPhaseButton },
      begin: () => undefined,
      done: () => phase().turn === 2 && phase().id === 'storm',
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Any player moves the game on with Next phase',
  'The arrow beside it steps back a phase',
  'A turn runs from the Storm to the Mentat Pause',
  'Some phases wait until every player presses Ready',
];

export const phasesAndTurns: ChapterScript = {
  slug: 'phases-and-turns',
  checkpoint: 'turn-1-storm',
  opening: (players) => {
    const seat = players.others()[0];
    if (seat) {
      players.act(seat, { kind: 'phase' });
    }
  },
  tasks,
  learned,
};
