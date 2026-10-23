import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install, lastCommand, predictionSnapshot } from './game.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Setup',
});

export const Prediction = meta.story({
  beforeEach: install(() => productTransport('seat-6', predictionSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Lock prediction' }, { timeout: 30_000 })).resolves.toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled();
    await expect(page.queryByRole('button', { name: /^Ready$/ })).toBeNull();
  },
});

/** A locked prediction without a card: the Worker deals none when the prediction faces were not captured, so the panel offers a reveal button. */
export const PredictionLocked = meta.story({
  beforeEach: install(() => productTransport('seat-6', predictionSnapshot(true))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Reveal prediction' }, { timeout: 30_000 })).resolves.toBeEnabled();
    await expect(page.getByRole('button', { name: 'Next phase' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Reveal prediction' }));
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({
        type: 'command',
        action: { kind: 'prediction-reveal', stepId: 'prediction' },
      })
    );
  },
});
