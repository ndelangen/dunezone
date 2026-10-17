import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import type { BackgroundData } from '@game/data/backgrounds';

import { BackgroundComposer, emptyBackgroundModeMemory } from './BackgroundComposer';

/* The fixture owns the mode memory beside the value, which is what every real caller does. */
function BackgroundStudioFixture({ background }: { background: BackgroundData }) {
  const [value, setValue] = useState<BackgroundData>(() => structuredClone(background));
  const [modeMemory, setModeMemory] = useState(emptyBackgroundModeMemory);
  return (
    <Box w="min(78rem, calc(100vw - 2rem))" p="md">
      <BackgroundComposer
        value={value}
        onChange={setValue}
        usedOn="faction sheet · faction token · leader tokens · troops · alliance card"
        modeMemory={modeMemory}
        onModeMemoryChange={setModeMemory}
      />
    </Box>
  );
}

/* Opens one color layer's editor, which the composer keeps collapsed until a layer is picked. */
async function openLayer(canvasElement: HTMLElement, layer: 'base' | 'pattern') {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(page.getByRole('button', { name: `Edit ${layer} color layer` }));
  return page;
}

const meta = preview.meta({
  title: 'Background Studio',
  component: BackgroundStudioFixture,
  globals: {
    viewport: {
      value: 'appDesktop',
    },
  },
  parameters: {
    layout: 'fullscreen',
  },
});

export const SolidSoftSubtle = meta.story({
  args: {
    background: {
      image: '/image/texture/021.jpg',
      colors: ['#17383d', '#d3ab63'],
      invert: false,
      definition: 0,
      influence: 0.15,
    },
  },
});

export const LinearLayers = meta.story({
  args: {
    background: {
      image: '/image/texture/052.jpg',
      colors: [
        {
          type: 'linear',
          angle: 135,
          stops: [
            ['#15233f', 0],
            ['#557f8c', 0.55],
            ['#d8c49d', 1],
          ],
        },
        {
          type: 'linear',
          angle: 35,
          stops: [
            ['#e7c66d', 0],
            ['#874b2a', 1],
          ],
        },
      ],
      invert: false,
      definition: 0.68,
      influence: 0.62,
    },
  },
  play: async ({ canvasElement }) => {
    for (const [layer, angle] of [
      ['base', '135°'],
      ['pattern', '35°'],
    ] as const) {
      const page = await openLayer(canvasElement, layer);
      await expect(await waitForFrame(() => page.getByRole('textbox', { name: 'Gradient angle' }))).toHaveValue(angle);
    }
  },
});

export const RadialLayers = meta.story({
  args: {
    background: {
      image: '/image/texture/075.jpg',
      colors: [
        {
          type: 'radial',
          x: 68,
          y: 30,
          r: 82,
          stops: [
            ['#dce3ca', 0],
            ['#55786c', 0.52],
            ['#243741', 1],
          ],
        },
        {
          type: 'radial',
          x: 35,
          y: 65,
          r: 76,
          stops: [
            ['#f2d78a', 0],
            ['#6f3d31', 1],
          ],
        },
      ],
      invert: true,
      definition: 0.48,
      influence: 0.7,
    },
  },
  play: async ({ canvasElement }) => {
    for (const [layer, center] of [
      ['base', ['68', '30', '82']],
      ['pattern', ['35', '65', '76']],
    ] as const) {
      const page = await openLayer(canvasElement, layer);
      await expect(await waitForFrame(() => page.getByRole('textbox', { name: 'Center X (optional)' }))).toHaveValue(
        center[0]
      );
      await expect(page.getByRole('textbox', { name: 'Center Y (optional)' })).toHaveValue(center[1]);
      await expect(page.getByRole('textbox', { name: 'Radius (optional)' })).toHaveValue(center[2]);
      await expect(page.queryByRole('textbox', { name: 'Gradient angle' })).toBeNull();
    }
  },
});
