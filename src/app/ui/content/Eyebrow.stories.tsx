import preview from '@sb/preview';

import { Eyebrow } from './Eyebrow';

const meta = preview.meta({
  component: Eyebrow,
  parameters: { layout: 'padded' },
  args: {
    children: 'From the catalogue',
  },
});

/** The default: recedes behind the value it names. Used for field captions. */
export const Muted = meta.story({});

/** Carries brand colour. Used where the label is part of the editorial voice. */
export const Accent = meta.story({
  args: { tone: 'accent' },
});

/** Letter-spacing makes long labels wrap early; they stay left aligned when they do. */
export const LongLabelWraps = meta.story({
  args: { tone: 'accent', children: 'Proposed content · page query required before launch' },
  globals: { viewport: { value: 'contentNarrow' } },
});
