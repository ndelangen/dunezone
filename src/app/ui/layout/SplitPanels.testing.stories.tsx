import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { SplitPanels } from './SplitPanels';
import { EVEN_LIMITS, evenLimits, panels, separatorOf, sizeOf } from './SplitPanels.stories.fixture';

const meta = testingPreview.meta({
  title: 'SplitPanels',
  component: SplitPanels,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Two panels either side of a separator the reader drags with the primary button or one finger, or steps with the keys. The caller gives the limits, as a function of the room, and the steps. Its parent gives it its size.',
      },
    },
  },
  args: { children: panels, step: 2, pageStep: 5 },
});

/** Side by side: the separator is vertical, and the first panel is the one it measures. Keys step it within the limits. */
export const SideBySide = meta.story({
  args: {
    orientation: 'vertical',
    defaultSize: 50,
    limits: evenLimits,
    label: 'Resize the two panels',
  },
  globals: { viewport: { value: 'region' } },
  play: async ({ canvasElement }) => {
    const separator = separatorOf(canvasElement);
    await expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    separator.focus();
    await userEvent.keyboard('{Home}');
    await expect(sizeOf(separator)).toBe(EVEN_LIMITS.min);
    await userEvent.keyboard('{ArrowRight}');
    await expect(sizeOf(separator)).toBe(EVEN_LIMITS.min + 2);
    await userEvent.keyboard('{ArrowUp}');
    await expect(sizeOf(separator)).toBe(EVEN_LIMITS.min + 2);
    await userEvent.keyboard('{PageUp}');
    await expect(sizeOf(separator)).toBe(EVEN_LIMITS.min + 7);
    await userEvent.keyboard('{End}');
    await expect(sizeOf(separator)).toBe(EVEN_LIMITS.max);
    await userEvent.keyboard('{ArrowRight}{PageUp}');
    await expect(sizeOf(separator)).toBe(EVEN_LIMITS.max);
    await userEvent.keyboard('{ArrowLeft}');
    await expect(sizeOf(separator)).toBe(EVEN_LIMITS.max - 2);
  },
});
