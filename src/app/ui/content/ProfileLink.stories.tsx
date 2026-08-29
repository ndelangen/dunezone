import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { ProfileLink } from './ProfileLink';

const meta = preview.meta({
  component: ProfileLink,
  parameters: { layout: 'centered' },
  args: {
    slug: 'central',
    name: 'Central',
    image: null,
  },
});

/**
 * Without an avatar image, the initials stand in;
 * the shape never collapses to bare text.
 *
 * The initials are drawn, not announced.
 * A reader hearing this link gets the person's name, where they once got "CE Central".
 */
export const InitialsFallback = meta.story({
  play: async ({ canvasElement }) => {
    const story = within(canvasElement);
    await expect(story.findByRole('link', { name: 'Central' })).resolves.toBeVisible();
  },
});

/** The usual citation: avatar and name, one link. */
export const WithAvatar = meta.story({
  args: { image: '/web/logo.svg' },
});

/** For tight contexts: an avatar group, a table cell. `title` keeps the name reachable. */
export const AvatarOnly = meta.story({
  args: { image: '/web/logo.svg', showName: false, title: 'Central' },
});
