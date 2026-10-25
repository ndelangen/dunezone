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
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'Central' })).toHaveAttribute('title', 'Central');
  },
});

/** Whole-row hover can carry the interaction without underlining the contributor. */
export const WithoutUnderline = meta.story({ args: { underline: 'never', density: 'compact' } });

/** A wide thread keeps the avatar above the full, wrapping name. */
export const ContributorWide = meta.story({
  args: { presentation: 'contributor', name: 'IdrisTheKeeperOfDuneTraditions', underline: 'never' },
  render: (args) => (
    <div style={{ containerType: 'inline-size', width: 900, maxWidth: '100%' }}>
      <div style={{ width: 160 }}>
        <ProfileLink {...args} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const link = await within(canvasElement).findByRole('link', { name: 'IdrisTheKeeperOfDuneTraditions' });
    const avatar = link.querySelector('[aria-hidden]')!;
    await expect(avatar.getBoundingClientRect().width).toBe(56);
    await expect(link.scrollWidth).toBeLessThanOrEqual(link.clientWidth);
  },
});

/** A phone keeps the name beside the same large avatar. */
export const ContributorNarrow = meta.story({
  args: { presentation: 'contributor', name: 'Leonard van der Meer', image: '/web/logo.svg', underline: 'never' },
  render: (args) => (
    <div style={{ containerType: 'inline-size', width: 320, maxWidth: '100%' }}>
      <ProfileLink {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const link = await within(canvasElement).findByRole('link', { name: 'Leonard van der Meer' });
    const avatar = link.querySelector('img')!;
    await expect(avatar.getBoundingClientRect().width).toBe(56);
    await expect(link.scrollWidth).toBeLessThanOrEqual(link.clientWidth);
  },
});
