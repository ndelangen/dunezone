import type { PieceAction, ServerMessage } from '@shared/play/protocol';
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test';

import setup from '../setup/setup.json';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { LocalTable } from './localTable';

/* Determine winner and its result change only the stored state, so a tutorial table runs them as the session does. */
describe('a tutorial table’s result', () => {
  let table: LocalTable;
  let sent: ServerMessage[];
  let count = 0;
  const act = (action: PieceAction, seat = table.seat) =>
    table.receive(
      { type: 'command', commandId: `command-${++count}`, action, expectedRevision: table.room.snapshot.revision },
      seat
    );
  const stored = () => table.room.snapshot;

  beforeEach(() => {
    table = new LocalTable(startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone'));
    sent = [];
    table.deliver = (message) => sent.push(message);
    /* The Mentat Pause is the turn's ninth phase. */
    for (let step = 0; step < 8; step++) {
      act({ kind: 'phase' });
    }
  });

  afterEach(() => table.dispose());

  test('declares a winner and continues the game from the Mentat Pause', () => {
    const winner = stored().roster!.seats.find((entry) => entry.faction)!.faction!.id;
    act({ kind: 'result-open' });
    expect(stored().ending?.by.seat).toBe(table.seat);
    act({ kind: 'result-declare', result: 'faction', factionIds: [winner] });
    expect(stored()).toMatchObject({
      stage: 'finished',
      ending: null,
      result: { kind: 'faction', factionIds: [winner] },
    });
    act({ kind: 'result-continue' });
    expect(stored()).toMatchObject({ stage: 'play', result: null });
    expect(table.refusal).toBeUndefined();
  });

  test('refuses a declaration from a player who did not open it, as the session does', () => {
    const other = table.seats().find((seat) => seat !== table.seat)!;
    act({ kind: 'result-open' });
    act({ kind: 'result-declare', result: 'none', factionIds: [] }, other);
    expect(table.refusal).toBe('Only the player determining the winner can do that.');
    expect(stored().stage).toBe('play');
  });

  test('still refuses what only a game’s session runs', () => {
    act({ kind: 'removal-start', seat: table.seats().find((seat) => seat !== table.seat)! });
    expect(table.refusal).toMatch(/need a real game/);
    expect(sent.at(-1)).toMatchObject({ type: 'view' });
  });
});
