import { Avatar } from '@mantine/core';
import preview from '@sb/preview';
import { Link } from '@tanstack/react-router';

import { Spotlight } from './Spotlight';

/* Any route works; a spotlight only needs somewhere to point. */
const linkToFactions = (rootProps: Record<string, unknown>) => <Link {...rootProps} to="/factions" />;

const meta = preview.meta({
  title: 'Spotlight',
  component: Spotlight,
  parameters: { layout: 'padded' },
  args: {
    media: <Avatar size="100%" radius="50%" name="House Ecaz" color="initials" />,
    eyebrow: 'New arrival',
    title: 'House Ecaz',
    meta: 'Created Jul 27, 2026',
    renderRoot: linkToFactions,
  },
});

/** Hover or focus it: the whole surface is the target. */
export const Default = meta.story({});

/** Drop the eyebrow when every peer in the list is here for the same reason. */
export const WithoutEyebrow = meta.story({
  args: { eyebrow: undefined, meta: 'Details, components, and special rules' },
});

/** The title truncates rather than reflowing the row or pushing the chevron out. */
export const LongTitle = meta.story({
  args: { title: 'The Combined Honored Matres and Bene Gesserit Reverend Mother Council' },
});

/** The narrow end of the range: the artwork shrinks and the title truncates sooner. */
export const InANarrowColumn = meta.story({
  globals: { viewport: { value: 'contentNarrow' } },
});
