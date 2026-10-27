import type { GameSnapshot } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { fn } from 'storybook/test';

import { SIX } from '../../product.stories.fixture';
import { finishedSnapshot, mentatSnapshot } from '../../results.stories.fixture';
import { panelMeta, tableOf } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { ResultPanel } from './ResultPanel';
import type { Choice, ResultPanelProps } from './ResultPanel';
import { predictionReveal, resultState } from './useResultPanel';

/** Turn 1 Mentat Pause, with the winner being determined by a seat's player; seat 2's faction holds a locked prediction if asked. */
export function determiningSnapshot(by: string, viewer = 'seat-2', prediction: { card?: boolean } | null = null) {
  const snapshot = mentatSnapshot(viewer, { prediction: prediction !== null, card: prediction?.card ?? false });
  const player = SIX.find((entry) => entry.seat === by)!;
  snapshot.ending = { by: { seat: by, name: player.name }, startedAt: 1 };
  return snapshot;
}

/** The panel's props as the table hands them for this snapshot, seen from a seat, with spied actions. */
export function resultArgs(snapshot: GameSnapshot, seat = 'seat-2', choice?: Choice): ResultPanelProps {
  const table = tableOf(snapshot, seat);
  return {
    state: resultState(table, choice),
    prediction: predictionReveal(table),
    disabled: false,
    onReveal: fn(),
    onChange: fn(),
    onStop: fn(),
    onDeclare: fn(),
  };
}

export const declaringArgs = (choice?: Choice) => resultArgs(determiningSnapshot('seat-2'), 'seat-2', choice);
export const finishedArgs = (seat = 'seat-2') => resultArgs(finishedSnapshot(seat), seat);
export const observerArgs = () => finishedArgs(SPECTATOR_SEAT);

export const resultPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.result),
  component: ResultPanel,
  args: declaringArgs(),
};
