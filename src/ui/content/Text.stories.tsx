import { Text } from '@mantine/core';
import preview from '@sb/preview';

import { asDefaultElement } from '../mantine.stories.fixture';

const meta = preview.meta({
  component: asDefaultElement(Text),
  parameters: { layout: 'padded' },
  globals: { backgrounds: { value: 'light', grid: false } },
  args: { children: 'Browse the living collection of community factions.' },
});

/** Body copy. */
export const Default = meta.story({});

/** `sm` is the app's working size: sidebars, card bodies, anything beside a heading. */
export const Small = meta.story({ args: { size: 'sm' } });

/** `dimmed` for supporting copy — descriptions, counts, the absence of something. */
export const Dimmed = meta.story({ args: { c: 'dimmed' } });

/** A deck below a page title. */
export const Lead = meta.story({ args: { size: 'lg' } });

/** Weight, for a value that has a caption above it. */
export const Emphasised = meta.story({ args: { fw: 700, children: 'House Atreides' } });
