import { Anchor } from '@mantine/core';
import preview from '@sb/preview';

import { asDefaultElement } from '../mantine.stories.fixture';

/**
 * Mantine's `Anchor` under our theme, in the dune primary.
 *
 * In the app these usually carry `renderRoot` so a router `Link` supplies the href; the shapes
 * below are the same component with a plain one.
 */
const meta = preview.meta({
  component: asDefaultElement(Anchor),
  parameters: { layout: 'padded' },
  globals: { backgrounds: { value: 'light', grid: false } },
  args: { href: '#', children: 'Back to factions' },
});

/** A link inside a sentence or under a heading. */
export const Default = meta.story({});

/** The one link that leads onward from a region, beside its heading. */
export const Emphasised = meta.story({
  args: { fw: 700, children: 'See every faction' },
});

/** In a breadcrumb above a page title. */
export const Small = meta.story({ args: { size: 'sm', fw: 600, children: 'Factions' } });
