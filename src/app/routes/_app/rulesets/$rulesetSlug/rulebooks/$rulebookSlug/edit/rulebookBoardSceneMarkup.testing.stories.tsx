import { testingPreview } from '@sb/preview';
import { boardTerritoryList } from '@shared/boards/tintDrawing';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { BOARD, references, scene } from './rulebookBoardSceneMarkup.stories.fixture';
import { SceneEditorStory } from './rulebookScenes.stories.fixture';

const meta = testingPreview.meta({
  title: 'Blocks/Board scene/Tints and tokens',
  parameters: { layout: 'fullscreen' },
});

/** Clicking a territory with a tint's brush on adds it to the tint, on the preview itself. */
export const PaintOnThePreview = meta.story({
  render: () => <SceneEditorStory kind="board" initial={scene} references={references} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Tints (2)' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Paint Spice blows' }));
    await waitFor(() => expect(canvasElement.querySelector('.rulebookBoardEditSurface[data-brush]')).not.toBeNull());
    const surface = canvasElement.querySelector<SVGRectElement>('.rulebookBoardEditSurface[data-brush]')!;
    const before = canvasElement.querySelectorAll('[data-tint="tint-spice"] path').length;
    const [x, y] = boardTerritoryList(BOARD).find((territory) => territory.id === 'imperial_basin')!.face.center;
    const box = surface.getBoundingClientRect();
    const scale = box.width / 487.06;
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: surface,
      coords: { clientX: box.left + x * scale, clientY: box.top + y * scale },
    });
    await waitFor(() =>
      expect(canvasElement.querySelectorAll('[data-tint="tint-spice"] path').length).toBeGreaterThan(before)
    );
  },
});
