import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { NotFoundState } from './NotFoundState';

const meta = preview.meta({
  component: NotFoundState,
  parameters: { layout: 'padded' },
  args: { noun: 'deck' },
});

/** The one wording for a thing that is not there; only the noun changes. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Deck not found')).toBeVisible();
  },
});

/** A thing whose address is a slug: an old link may have moved after a rename. */
export const Renamed = meta.story({ args: { noun: 'ruleset', renamed: true } });
