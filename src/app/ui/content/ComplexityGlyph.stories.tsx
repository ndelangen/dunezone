import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { ComplexityGlyph } from './ComplexityGlyph';

const meta = preview.meta({
  component: ComplexityGlyph,
  parameters: { layout: 'centered' },
});

export const Novice = meta.story({ args: { score: 0.1 } });

export const MasterWithValue = meta.story({
  args: { score: 0.9, showValue: true },
  play: async ({ canvasElement }) => {
    const glyph = within(canvasElement).getByRole('img', { name: 'Master complexity, 9 out of 10' });
    await expect(within(glyph).getByText('9/10')).toBeVisible();
  },
});

export const LiveProgress = meta.story({ args: { score: 0.6, progressRing: true, size: 16 } });
