import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { BlogByline } from './BlogByline';

const meta = preview.meta({
  component: BlogByline,
  parameters: { layout: 'centered' },
  args: { date: '2026-10-14', author: { name: 'Central419', profileSlug: 'central' } },
});

/** A known author's name links to their verified profile. */
export const LinkedAuthor = meta.story({
  play: async ({ canvasElement }) => {
    const story = within(canvasElement);
    const link = await story.findByRole('link', { name: 'Central419' });
    await expect(link).toHaveAttribute('href', '/profiles/central');
    await expect(story.getByText('Oct 14, 2026')).toBeVisible();
  },
});

/** A written byline stays visible when no public profile has been verified. */
export const UnlinkedAuthor = meta.story({
  args: { author: { name: 'Guest author', profileSlug: undefined } },
  play: async ({ canvasElement }) => {
    const story = within(canvasElement);
    await expect(story.getByText('Guest author')).toBeVisible();
    await expect(story.queryByRole('link')).not.toBeInTheDocument();
  },
});

/** Over header artwork the byline is white with a shadow, and a known author shows their avatar. */
export const InverseWithAvatar = meta.story({
  args: {
    tone: 'inverse',
    author: { name: 'Central419', profileSlug: 'central', image: '/web/logo.svg' },
  },
  play: async ({ canvasElement }) => {
    const story = within(canvasElement);
    const link = await story.findByRole('link', { name: 'Central419' });
    await expect(link.querySelector('img')).toHaveAttribute('src', '/web/logo.svg');
  },
});
