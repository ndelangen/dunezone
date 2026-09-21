import preview from '@sb/preview';
import { restingPositionAt } from '@shared/play/tableGeometry';
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
  beforeEach: install(() => {
    const snapshot = setupSnapshot();
    const decks = snapshot.table.pieces.filter((piece) => piece.stackKey === 'cards:traitor');
    const gathered = {
      ...decks[0]!,
      id: 'other-traitors',
      label: 'Traitor deck',
      orientation: 0,
      items: decks.flatMap((piece) => piece.items),
    };
    gathered.position = restingPositionAt([0, 0, 7.5], gathered);
    snapshot.table.pieces = [...snapshot.table.pieces.filter((piece) => piece.stackKey !== 'cards:traitor'), gathered];
    snapshot.versions = Object.fromEntries(snapshot.table.pieces.map((piece) => [piece.id, snapshot.revision]));
    snapshot.setup!.index = 1;
    snapshot.setup!.mapRevealed = true;
    snapshot.setup!.completed = ['traitors'];
    snapshot.controls!.ready = snapshot.controls!.seats;
    return hostedStoryTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Next phase' }, { timeout: 30_000 })).resolves.toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Next phase' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'phase' } }));
  },
});

export const Prediction = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', predictionSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Lock prediction' }, { timeout: 30_000 })).resolves.toBeDisabled();
    expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled();
    expect(page.queryByRole('button', { name: /^Ready$/ })).toBeNull();
  },
});

export const LockedPrediction = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', predictionSnapshot(true))),
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
