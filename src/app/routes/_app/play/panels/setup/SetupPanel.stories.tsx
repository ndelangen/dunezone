import preview from '@sb/preview';
import { expect } from 'storybook/test';

import {
  inSetupWindow,
  predicting,
  predictionCard,
  predictionLocked,
  setupArgs,
  setupPanelMeta,
  startingTroops,
} from './SetupPanel.stories.fixture';

/*
 * The Setup window on its own, for a six-seat game: each story is one setup step, or one state of a prediction.
 * The window's name, glyph and (?) follow the step, as the table installs it.
 */
const meta = preview.meta({ ...setupPanelMeta, title: 'Play/Panels/Setup' });

/** The traitors step: the tabletop traitors are gathered from here. */
export const Traitors = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Gather tabletop traitors' })).toBeVisible();
  },
});

/** Starting troops: each faction's line, the viewer's own first. */
export const StartingTroops = meta.story({
  args: setupArgs(startingTroops()),
  parameters: inSetupWindow(startingTroops()),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^10 troops in Carthag and 10 in reserves/)).toBeVisible();
  },
});

/** The viewer predicts the winner and the turn of its victory. */
export const Predicting = meta.story({
  args: setupArgs(predicting(), 'seat-6'),
  parameters: inSetupWindow(predicting()),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Lock prediction' })).toBeDisabled();
  },
});

/** Another faction predicts: the viewer waits for its player. */
export const WaitingForAPrediction = meta.story({
  args: setupArgs(predicting()),
  parameters: inSetupWindow(predicting()),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Waiting for the faction player to lock a prediction.')).toBeVisible();
  },
});

/** The viewer's prediction is locked without a dealt card, so it is revealed with its button. */
export const PredictionLocked = meta.story({
  args: setupArgs(predictionLocked(), 'seat-6'),
  parameters: inSetupWindow(predictionLocked()),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Reveal prediction' })).toBeVisible();
  },
});

/** The viewer's locked prediction is a card in hand: placing it on the table is the reveal, so the window offers no button (#1753). */
export const PredictionCardInHand = meta.story({
  args: setupArgs(predictionCard(), 'seat-6'),
  parameters: inSetupWindow(predictionCard()),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Prediction locked. Place your prediction card on the table to reveal it.')
    ).toBeVisible();
  },
});
