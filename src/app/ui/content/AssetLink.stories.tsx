import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { AssetLink } from './AssetLink';

const meta = preview.meta({
  component: AssetLink,
  parameters: { layout: 'centered' },
  args: {
    type: 'deck',
    slug: 'spice-deck',
    name: 'Spice Deck',
  },
});

/** The citation: glyph and name, one link, ready to sit inside an attribution caption. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', { name: 'Spice Deck' });
    await expect(link).toHaveAttribute('href', '/assets/deck/spice-deck');
    await expect(link.querySelector('svg.lucide-boxes')).toBeVisible();
  },
});
