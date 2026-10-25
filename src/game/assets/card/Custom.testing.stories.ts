import { testingPreview } from '@sb/preview';
import { expect, within } from 'storybook/test';

import { CustomCard } from './Custom';
import { face, windowCard, windowLayers } from './Custom.stories.fixture';

const meta = testingPreview.meta({
  component: CustomCard,
  globals: { viewport: { value: 'card' } },
  args: face,
});
/* The storm card's rules layer, narrowed so a story can restate its text and placement. */
const rulesLayer = windowLayers.find((layer) => layer.kind === 'text')!;
export const LowestWindow = meta.story({
  args: {
    ...windowCard,
    name: 'Moving window',
    windowOffsetY: 440,
    layers: [
      { ...windowLayers[0]!, offset: [0, 278.5] },
      { ...rulesLayer, content: 'Rules above the decal window.', offset: [-370, -331.5], height: 120 },
      {
        ...rulesLayer,
        layerId: '30000000-3000-4000-8000-300000000003',
        content: 'Rules below the decal window.',
        offset: [-370, 508.5],
        size: 30,
        height: 45,
      },
    ],
  },
  /* At the largest offset the window still closes above the card's bottom edge, and the text below it sits between the two. */
  play: async ({ canvasElement }) => {
    const hole = canvasElement.querySelector('mask rect[fill="black"]')!;
    const frame = hole.closest('svg')!;
    const windowBottom = Number(hole.getAttribute('y')) + Number(hole.getAttribute('height'));
    await expect(windowBottom).toBeLessThanOrEqual(1263);
    const card = frame.getBoundingClientRect();
    /* The window's edge is in the frame's 1263-unit card space, so scale it to the rendered card before comparing it with the text. */
    const windowBottomOnScreen = card.top + (windowBottom * card.height) / 1263;
    const below = within(canvasElement).getByText('Rules below the decal window.').getBoundingClientRect();
    await expect(below.top).toBeGreaterThanOrEqual(windowBottomOnScreen);
    await expect(below.bottom).toBeLessThanOrEqual(card.bottom);
  },
});
