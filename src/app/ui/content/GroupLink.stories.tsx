import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

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

/** Only the disc, for a tight row: the name moves into a tooltip and names the link. */
export const DiscOnly = meta.story({
  args: { showName: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'The Landsraad' })).toBeVisible();
  },
});
