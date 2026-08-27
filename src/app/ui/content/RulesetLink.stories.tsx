import preview from '@sb/preview';

import { RulesetLink } from './RulesetLink';

const meta = preview.meta({
  component: RulesetLink,
  parameters: { layout: 'centered' },
  args: {
    slug: 'dreamrules',
    name: 'Dreamrules',
  },
});

/** The citation: glyph and name, one link, ready to sit inside a sentence. */
export const Default = meta.story({});
