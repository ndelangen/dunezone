import preview from '@sb/preview';

import { GroupLink } from './GroupLink';

const meta = preview.meta({
  component: GroupLink,
  parameters: { layout: 'centered' },
  args: {
    slug: 'the-landsraad',
    name: 'The Landsraad',
  },
});

/** The citation: glyph and name, one link. The glyph stands in because groups carry no image. */
export const Default = meta.story({});
