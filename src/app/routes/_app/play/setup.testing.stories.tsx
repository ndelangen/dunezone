import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { openPanel } from './controls.stories.fixture';
import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { productTransport, setupSnapshot, preparedSnapshot } from './product.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Setup',
});

export const TraitorSelection = meta.story({
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
    await openPanel(canvasElement, 'Shared table inventory');
    /* The shelves show in setup, but none of their + buttons: the catalogue opens once play starts. */
    await expect(page.findByRole('region', { name: 'Tech tokens' })).resolves.toBeVisible();
    await expect(page.queryAllByRole('button', { name: /from the catalogue$/ })).toEqual([]);
    await openPanel(canvasElement, 'Hand');
  },
});

export const StartingTroops = meta.story({
  beforeEach: install(() => productTransport('seat-2', preparedSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Next phase' }, { timeout: 30_000 })).resolves.toBeEnabled();
    const setup = await openPanel(canvasElement, 'Setup');
    await expect(
      setup.findByText(/^10 troops in Carthag and 10 in reserves/, {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Next phase' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'phase' } }));
  },
});
