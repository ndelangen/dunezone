import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { FactionVariantCount } from './FactionVariantCount';

const meta = preview.meta({
  component: FactionVariantCount,
  parameters: { layout: 'padded' },
  args: { count: 3 },
});

/** The variants mark and the number, dimmed, read aloud as one phrase. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: '3 variants' })).toBeVisible();
  },
});
