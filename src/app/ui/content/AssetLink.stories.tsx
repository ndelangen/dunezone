import preview from '@sb/preview';

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
export const Default = meta.story({});
