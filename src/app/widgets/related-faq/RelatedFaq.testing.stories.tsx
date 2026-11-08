import { testingPreview } from '@sb/preview';
import { expect, fn, within } from 'storybook/test';

import { RelatedFaq } from './RelatedFaq';

const meta = testingPreview.meta({
  component: RelatedFaq,
  args: { items: [], status: 'Exhausted' as const, onLoadMore: fn(), onOpenQuestion: fn() },
});

/** A page with nothing related shows no Related FAQ at all, not a heading over an empty line. */
export const EmptyRendersNothing = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('region', { name: 'Related FAQ' })).toBeNull();
  },
});

/** While the first page loads there is nothing to show yet either, so the block never flashes empty. */
export const LoadingRendersNothing = meta.story({
  args: { status: 'LoadingFirstPage' as const },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('region', { name: 'Related FAQ' })).toBeNull();
  },
});
