import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { openPanel, WAIT } from './controls.stories.fixture';
import { gameMeta, install, lastCommand, predictionSnapshot, session } from './game.stories.fixture';
import { productTransport, setupSnapshot, preparedSnapshot } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Setup',
});

export const TraitorSelection = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  beforeEach: install(() => productTransport('seat-2', setupSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('button', { name: 'Gather tabletop traitors' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled();
    const traitors = session.transport.snapshot.table.pieces
      .filter((piece) => piece.stackKey === 'cards:traitor')
      .flatMap((piece) => piece.items);
    await expect(traitors).toHaveLength(30);
    await expect(traitors.filter((card) => card.faceUp || card.artwork?.name || card.artwork?.front)).toEqual([]);
    await userEvent.click(page.getByRole('button', { name: /^Ready$/ }));
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'ready', ready: true } })
    );
    await openPanel(canvasElement, 'Spice');
    await expect(page.findByLabelText('Spice reserve balance')).resolves.toBeVisible();
    await openPanel(canvasElement, 'Shared inventory');
    await expect(page.queryByRole('button', { name: 'Add from catalogue' })).toBeNull();
    await openPanel(canvasElement, 'Hand');
  },
});

export const StartingTroops = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  beforeEach: install(() => productTransport('seat-2', preparedSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Next phase' }, { timeout: 30_000 })).resolves.toBeEnabled();
    const setup = await openPanel(canvasElement, 'Setup');
    await expect(
      setup.findByText(/^10 forces in Carthag and 10 in reserves/, {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Next phase' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'phase' } }));
  },
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

/** Setup, the locked prediction whose card is in hand: placing the card is the reveal, so the panel offers no button (#1753). */
export const PredictionCardInHand = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  beforeEach: install(() => productTransport('seat-6', predictionSnapshot(true, true))),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Setup');
    await expect(
      page.findByText('Prediction locked. Place your prediction card on the table to reveal it.', undefined, WAIT)
    ).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Reveal prediction' })).toBeNull();
  },
});

/** Two seats carry factions with one name, so each reads with its player in the prediction's options (#1667). */
export const PredictionSharedName = meta.story({
  beforeEach: install(() => {
    const snapshot = predictionSnapshot();
    const [first, second] = snapshot.roster!.seats;
    second!.faction!.name = first!.faction!.name;
    return productTransport('seat-6', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Setup');
    const [first, second] = predictionSnapshot().controls!.players;
    const name = predictionSnapshot().roster!.seats[0]!.faction!.name;
    await userEvent.click(await page.findByRole('combobox', { name: 'Predicted winner' }, WAIT));
    await expect(page.findByRole('option', { name: `${name} (${first!.name})` }, WAIT)).resolves.toBeVisible();
    await expect(page.findByRole('option', { name: `${name} (${second!.name})` }, WAIT)).resolves.toBeVisible();
  },
});
