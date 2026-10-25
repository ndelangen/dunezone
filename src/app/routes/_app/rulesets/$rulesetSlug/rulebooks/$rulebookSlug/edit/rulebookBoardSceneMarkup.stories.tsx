import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db } from '@db/storybook';

import { references, scene } from './rulebookBoardSceneMarkup.stories.fixture';
import { SceneEditorStory } from './rulebookScenes.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Board scene/Tints and tokens',
  parameters: { layout: 'fullscreen' },
});

/** A scene on a saved board: its tints and tokens use the Spice card's rows, and the preview is where they are painted and dragged. */
export const SavedBoard = meta.story({
  render: () => <SceneEditorStory kind="board" initial={scene} references={references} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('[data-tint]')).toHaveLength(2);
    await expect(canvasElement.querySelectorAll('[data-tint-sticker="explode"]').length).toBeGreaterThan(0);
    await expect(canvasElement.querySelectorAll('[data-token-instance]')).toHaveLength(2);
    await expect(canvas.queryByRole('button', { name: /^Highlights/ })).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Tints (2)' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Tokens (2)' })).toBeVisible();
  },
});

/** The Board field lists the maintained map and the saved boards, each beside its face; the saved boards load once it opens. */
export const ChooseABoard = meta.story({
  /* The story database's baseline catalogue holds a saved board, which the Board field lists once opened. */
  parameters: { database: db((baseline) => baseline) },
  render: () => <SceneEditorStory kind="board" initial={scene} references={references} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const field = await canvas.findByRole('combobox', { name: 'Board' }, { timeout: 20_000 });
    await expect(field).toHaveValue('Arrakis Official');
    await userEvent.click(field);
    await expect(await body.findByRole('option', { name: /Arrakis board/ })).toBeVisible();
    await waitFor(() => expect(body.queryByRole('option', { name: /Loading saved boards/ })).toBeNull());
    /* Closing without a pick keeps the chosen board named, whether or not the catalogue holds it. */
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(field).toHaveValue('Arrakis Official'));
  },
});

/** Picking the maintained map from the field moves the scene onto it, keeping its tints and tokens, which draw there too. */
export const PickTheMaintainedBoard = meta.story({
  parameters: { database: db((baseline) => baseline) },
  render: () => <SceneEditorStory kind="board" initial={scene} references={references} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const field = await canvas.findByRole('combobox', { name: 'Board' }, { timeout: 20_000 });
    await userEvent.click(field);
    await userEvent.click(await body.findByRole('option', { name: /Arrakis board/ }));
    await waitFor(() => expect(field).toHaveValue('Arrakis board'));
    await expect(canvas.getByRole('button', { name: 'Tints (2)' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Tokens (2)' })).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-tint]')).toHaveLength(2);
  },
});
