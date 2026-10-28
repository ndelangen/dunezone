import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { SIX } from '../../product.stories.fixture';
import {
  declaringArgs,
  determiningSnapshot,
  finishedArgs,
  observerArgs,
  resultArgs,
  resultPanelMeta,
} from './ResultPanel.stories.fixture';

/*
 * The Result window on its own, at the end of a six-seat game seen from seat 2: declaring the result, waiting while someone else does, and the finished game.
 * Each story shows one state.
 */
const meta = preview.meta({ ...resultPanelMeta, title: 'Play/Panels/Result' });

/** The viewer is determining the winner and has chosen nothing yet, so Declare waits for a choice. */
export const Declaring = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Declare' })).toBeDisabled();
  },
});

/** The viewer picked an alliance: the winners are chosen from every faction at the table. */
export const DeclaringAnAlliance = meta.story({
  args: declaringArgs({ kind: 'alliance', faction: null, alliance: [] }),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Winning alliance')).toBeVisible();
  },
});

/** Someone else is determining the winner, and the viewer holds no prediction. */
export const Determining = meta.story({
  args: resultArgs(determiningSnapshot('seat-1')),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(`${SIX[0]!.name} is determining the winner`)).toBeVisible();
  },
});

/** The viewer's locked prediction is a card in hand, so placing it on the table is the reveal and the window offers no button. */
export const DeterminingWithAPredictionCard = meta.story({
  args: resultArgs(determiningSnapshot('seat-1', 'seat-2', { card: true })),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Place its card on the table now/)).toBeVisible();
  },
});

/** Without a dealt card the viewer reveals their locked prediction with its button. */
export const DeterminingWithAPrediction = meta.story({
  args: resultArgs(determiningSnapshot('seat-1', 'seat-2', {})),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Reveal prediction' })).toBeVisible();
  },
});

/** The game is finished: the result, who declared it, and where the game continues. */
export const Finished = meta.story({
  args: finishedArgs(),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/won as an alliance/)).toBeVisible();
  },
});

/** An observer sees the result, and that the table stays as it was. */
export const FinishedForAnObserver = meta.story({
  args: observerArgs(),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/The table stays as it was/)).toBeVisible();
  },
});
