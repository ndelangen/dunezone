import preview from '@sb/preview';

import { factionMergePath, mergeFactions } from './adminFactionMerge.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

/*
 * The page keeps its choices in itself, so the one presentation it has without a press is the empty one.
 * Every state past a choice is reached by a play, and those stories are in the testing file.
 */
const meta = preview.meta({
  title: 'Admin/Faction merge',
  ...pageStoryMeta,
  args: { path: factionMergePath },
  parameters: { ...pageStoryMeta.parameters, database: mergeFactions },
});

/** Before any choice: the faction to keep, the checkbox that turns the page to its own variants, and the faction to merge. */
export const Default = meta.story({});

export const DefaultPhone = meta.story({
  globals: { ...pageStoryMeta.globals, viewport: { value: 'appMobile' } },
});
