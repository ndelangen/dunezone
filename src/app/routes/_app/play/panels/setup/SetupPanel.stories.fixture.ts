import type { GameSnapshot } from '@shared/play/protocol';
import { fn } from 'storybook/test';

import { predictionSnapshot } from '../../game.stories.fixture';
import { preparedSnapshot, setupSnapshot } from '../../product.stories.fixture';
import { panelMeta, tableOf } from '../PanelWindow.stories.fixture';
import { SetupPanel } from './SetupPanel';
import type { SetupPanelProps } from './SetupPanel';
import { setupPanelProps, setupWindow } from './useSetupPanel';

/** The panel's props as the table hands them for this snapshot, seen from a seat, with spied actions. */
export function setupArgs(snapshot: GameSnapshot, seat = 'seat-2'): SetupPanelProps {
  return setupPanelProps(tableOf(snapshot, seat), {
    onGatherTraitors: fn(),
    onLockPrediction: fn(),
    onRevealPrediction: fn(),
  })!;
}

/** The Setup window as the table names it for this snapshot's step, for a story's `panelWindow` parameter. */
export const inSetupWindow = (snapshot: GameSnapshot) => ({ panelWindow: setupWindow(snapshot.setup!) });

/* The six-seat game's setup, seen from seat 2 on the traitors step, then on starting troops; seat 6 predicts the winner. */
export const traitors = setupSnapshot;
export const startingTroops = preparedSnapshot;
export const predicting = () => predictionSnapshot();
export const predictionLocked = () => predictionSnapshot(true);
export const predictionCard = () => predictionSnapshot(true, true);

export const setupPanelMeta = {
  ...panelMeta(setupWindow(traitors().setup!)),
  component: SetupPanel,
  args: setupArgs(traitors()),
};
