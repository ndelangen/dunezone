import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { refText, SEED_REF_TOKEN } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { session as gameSession, install, lastCommand, predictionSnapshot } from './game.stories.fixture';
import { GameRuntimeContext } from './multiplayer/gameRuntime';
import {
  GAME_KEY,
  productTransport as hostedStoryTransport,
  parameters,
  setupSnapshot,
  preparedSnapshot,
} from './product.stories.fixture';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Setup',
  args: { path: refText(GAME_KEY, `/play/${SEED_REF_TOKEN}`) },
  decorators: [
    (Story) => (
      <GameRuntimeContext value={gameSession.runtime}>
        <Story />
      </GameRuntimeContext>
    ),
  ],
});

export const TraitorSelection = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', setupSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('button', { name: 'Gather tabletop traitors' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: /^Ready$/ }));
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'ready', ready: true } })
    );
    await userEvent.click(page.getByRole('button', { name: /^Spice$/ }));
    await expect(page.findByLabelText('Banked spice')).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: /^Shared inventory$/ }));
    expect(page.queryByRole('button', { name: 'Add from catalogue' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: /^Hand$/ }));
  },
});

export const StartingForces = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', preparedSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Next phase' }, { timeout: 30_000 })).resolves.toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Next phase' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'phase' } }));
  },
});

export const Prediction = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-6', predictionSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Lock prediction' }, { timeout: 30_000 })).resolves.toBeDisabled();
    expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled();
    expect(page.queryByRole('button', { name: /^Ready$/ })).toBeNull();
  },
});

export const LockedPrediction = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-6', predictionSnapshot(true))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Reveal prediction' }, { timeout: 30_000 })).resolves.toBeEnabled();
    expect(page.getByRole('button', { name: 'Next phase' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Reveal prediction' }));
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({
        type: 'command',
        action: { kind: 'prediction-reveal', stepId: 'prediction' },
      })
    );
  },
});
