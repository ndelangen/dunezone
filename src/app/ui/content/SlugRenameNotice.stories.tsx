import preview from '@sb/preview';

import { SlugRenameNotice } from './SlugRenameNotice';

const meta = preview.meta({
  component: SlugRenameNotice,
  parameters: { layout: 'padded' },
  args: {
    noun: 'ruleset',
    url: '…/rulesets/dune-classic',
  },
});

/** As it appears under a name field. */
export const Default = meta.story({});

export const Group = meta.story({
  args: { noun: 'group', url: '…/groups/spice-cartel' },
});

/**
 * A profile's address is derived from the display name rather than equal to it, so the rule needs
 * one more clause than the sentence gives by default.
 */
export const WithExtraRule = meta.story({
  args: {
    noun: 'profile',
    url: '…/profiles/paul-atreides',
    note: 'A number is appended when the derived id is already taken.',
  },
});
