import preview from '@sb/preview';

import { FactionLink } from './FactionLink';

const meta = preview.meta({
  component: FactionLink,
  parameters: { layout: 'centered' },
  args: {
    factionId: 'house-atreides',
    name: 'House Atreides',
  },
});

/** The citation: glyph and name, one link, ready to sit inside a sentence. */
export const Default = meta.story({});
