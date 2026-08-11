import { Title } from '@mantine/core';
import preview from '@sb/preview';

import { asDefaultElement } from '../mantine.stories.fixture';

/**
 * Mantine's `Title` under our theme: Candara at weight 700, in the content text colour.
 *
 * A heading that names a region of a page belongs in a `Card` or `Region` slot rather than here —
 * these stories are the raw scale, and the one place a bare `Title` is right is a page's own `h1`.
 */
const meta = preview.meta({
  component: asDefaultElement(Title),
  parameters: { layout: 'padded' },
  globals: { backgrounds: { value: 'light', grid: false } },
  args: { children: 'The Landsraad convenes' },
});

/** The page's own name, once per route, in `PageLayout`'s header. */
export const PageTitle = meta.story({ args: { order: 1 } });

export const SectionHeading = meta.story({ args: { order: 2 } });

export const Subheading = meta.story({ args: { order: 3 } });

/**
 * `order` and `size` are independent: this is an `h2` to a screen reader and an `h4` to the eye,
 * for a heading whose surroundings already separate it.
 */
export const QuieterThanItsLevel = meta.story({ args: { order: 2, size: 'h4' } });

/** Long headings wrap rather than truncate — nothing clips a name. */
export const LongTitleWraps = meta.story({
  args: { order: 1, children: 'Everything the Bene Gesserit brought to the Landsraad this turn' },
  globals: { viewport: { value: 'contentColumn' } },
});
