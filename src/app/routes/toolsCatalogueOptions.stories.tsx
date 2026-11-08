import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { findTitledPage } from './site.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

/* The catalogue layouts shown to Norbert to pick from (2026-11-08); each story is one option, the rest go once he picks. */
const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tools/Catalogue options',
});

const opensTheTracker = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const page = await findTitledPage(canvasElement, /^Tools$/);
  await expect(page.getAllByRole('link', { name: /Treachery tracker/ })[0]).toHaveAttribute(
    'href',
    '/tools/atreides-treachery-tracker'
  );
};

/** A: the first version, tiles with a mark, a chip and two lines. */
export const A_Tiles = meta.story({ args: { path: '/tools?layout=tiles' }, play: opensTheTracker });

/** B: a shelf of Spotlights, the kit's go-to row, two or three across. */
export const B_Shelf = meta.story({ args: { path: '/tools?layout=shelf' }, play: opensTheTracker });

/** C: a phone home screen: big round marks with the name beneath. */
export const C_Launcher = meta.story({ args: { path: '/tools?layout=launcher' }, play: opensTheTracker });

/** D: one pane per group with divided rows, what each tool does as tags. */
export const D_Ledger = meta.story({ args: { path: '/tools?layout=ledger' }, play: opensTheTracker });

/** E: the Future plans atlas: a side index and numbered editorial entries. */
export const E_Atlas = meta.story({ args: { path: '/tools?layout=atlas' }, play: opensTheTracker });

/** F: the Treachery tracker featured on its own, the rest as a compact list. */
export const F_Featured = meta.story({ args: { path: '/tools?layout=featured' }, play: opensTheTracker });
