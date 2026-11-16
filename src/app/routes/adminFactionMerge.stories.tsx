import preview from '@sb/preview';

import {
  chooseMerge,
  chooseMove,
  chooseParent,
  factionMergePath,
  mergeFactions,
  review,
} from './adminFactionMerge.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Admin/Faction merge',
  ...pageStoryMeta,
  args: { path: factionMergePath },
  parameters: { ...pageStoryMeta.parameters, database: mergeFactions },
});

/** A duplicate with three variants, one of them deleted, placed under the kept faction's first variant. */
export const MergePreview = meta.story({
  play: async ({ canvasElement }) => {
    await chooseMerge(canvasElement, 'advanced', 'Add Atreides (advanced) · Advanced game');
  },
});

/** Reviewed in place, as the account merge is: what the write does, then Merge or Cancel. */
export const MergeReview = meta.story({
  play: async ({ canvasElement }) => {
    const page = await chooseMerge(canvasElement, 'advanced', 'Add Atreides (advanced) · Advanced game');
    await review(page, 'Review merge');
  },
});

/** The duplicate's variant has a name the kept faction already uses, which the name field says and the review waits for. */
export const NameClash = meta.story({
  play: async ({ canvasElement }) => {
    await chooseMerge(canvasElement, 'copy', 'Add Atreides copy');
  },
});

/** The checkbox turns the page to the kept faction's own variants: Dreamrules, with the variant under it, moves to another parent. */
export const Reparent = meta.story({
  play: async ({ canvasElement }) => {
    const page = await chooseMove(canvasElement, 'Dreamrules');
    await chooseParent(page, 'Tournament play');
  },
});

export const MergePreviewPhone = meta.story({
  globals: { ...pageStoryMeta.globals, viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    await chooseMerge(canvasElement, 'advanced', 'Add Atreides (advanced) · Advanced game');
  },
});
