import type { PieceAction } from '@shared/play/protocol';

import recorded from '../setup/setup.json';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { LocalTable } from '../table/localTable';
import type { ChapterScript, TablePlayers } from './chapterScript';

/* Each exercise runs the same local room and viewer projection as its chapter. */
export function chapterTable(script: ChapterScript) {
  const table = new LocalTable(
    startAt(recorded as unknown as TutorialSetup, script.checkpoint, 'https://dune.zone', script)
  );
  let sequence = 0;
  const act = (action: PieceAction, seat = table.seat) =>
    table.receive(
      {
        type: 'command',
        commandId: `chapter-${++sequence}`,
        action,
        expectedRevision: table.room.snapshot.revision,
      },
      seat
    );
  const snapshot = () => table.frame().snapshot;
  const players: TablePlayers = {
    act: (seat, action) => act(action, seat),
    viewOf: (seat) => table.frame(seat).snapshot,
    others: () => table.seats().filter((seat) => seat !== table.seat),
    landings: () => table.landings(),
    acceptedActions: () => table.acceptedActions(),
    pings: () => table.pings(),
    captured: () => undefined,
    capturedPieces: () => [],
  };
  script.opening?.(players);
  const tasks = script.tasks(snapshot, players);
  const finishes: (() => void)[] = [];
  return {
    table,
    act,
    snapshot,
    players,
    tasks,
    step: (id: string) => {
      const task = tasks.find((task) => task.id === id)!;
      const baseline = task.begin({ camera: null });
      const finish = () => task.finish?.(baseline);
      finishes.push(finish);
      return { done: () => task.done(baseline, { camera: null }), finish };
    },
    dispose: () => {
      finishes.forEach((finish) => finish());
      table.dispose();
    },
  };
}
