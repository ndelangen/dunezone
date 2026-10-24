import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { db } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { StorybookPage, syncPreviewFrameHash } from '../../storybook';
import { encodeRulebookTextLocator } from './$rulesetSlug/rulebooks/$rulebookSlug/rulebookReaderLinks';
import { readerPath, SETTLE_TIMEOUT_MS, withRulebookReader } from './rulebook-reader.stories.fixture';

const clippedCaptionEnding = 'The final caption words still belong to this Edition.';
const clippedLocatorParam = encodeRulebookTextLocator({
  v: 1,
  path: [
    { kind: 'page', id: 'CHAP' },
    { kind: 'block', id: 'HERA' },
  ],
  exact: clippedCaptionEnding,
});

function withClippedRulebookReader(baseline: StorybookDatabase) {
  withRulebookReader(baseline);
  const editionOne = baseline.rulebook_edition_contents.at(-2)?.contents;
  const block = editionOne?.pagesById.CHAP?.blocksById.HERA;
  if (block?.kind !== 'referenced-illustration') {
    throw new Error('Clipped reader Story needs Edition 1 chapter artwork');
  }
  block.caption = `${'The caption continues below the fixed Page. '.repeat(320)}${clippedCaptionEnding}`;
  return baseline;
}

const meta = preview.meta({
  title: 'Rulesets/Rulebook reader',
  component: StorybookPage,
  args: { path: readerPath },
  beforeEach: syncPreviewFrameHash,
  parameters: { layout: 'fullscreen', database: db(withRulebookReader) },
});

const editionsPath = `${readerPath}/editions`;

export const EditionHistory = meta.story({
  args: { path: editionsPath },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByText('2 Editions')).toBeVisible();
    const list = within(page.getByRole('list', { name: 'Editions' }));
    const items = list.getAllByRole('listitem');
    await expect(items).toHaveLength(2);
    await expect(within(items[0]!).getByText('Edition 2')).toBeVisible();
    await expect(within(items[0]!).getByText('Current')).toBeVisible();
    await expect(within(items[1]!).queryByText('Current')).not.toBeInTheDocument();
    await expect(list.getByRole('link', { name: 'Read Edition 2' })).toHaveAttribute('href', readerPath);
    await expect(list.getByRole('link', { name: 'Read Edition 1' })).toHaveAttribute('href', `${readerPath}?edition=1`);
    await expect(list.getAllByText('HTML preparing')).toHaveLength(2);
    await expect(list.getAllByText('PDF preparing')).toHaveLength(2);
  },
});

export const CurrentEdition = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByText('Edition 2')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The gathered rules' })).toBeVisible();
    const pageNavigation = within(page.getByRole('navigation', { name: 'Rulebook Pages' }));
    await expect(pageNavigation.getAllByRole('link', { current: 'page' })).toHaveLength(1);
    await expect(pageNavigation.getByRole('link', { current: 'page' })).toHaveAttribute('data-active', 'true');
    const articles = page.getAllByRole('article');
    await expect(articles).toHaveLength(3);
    await expect(canvasElement.ownerDocument.defaultView?.getComputedStyle(articles[1]!).contentVisibility).toBe(
      'auto'
    );
  },
});

export const ClippedLinkedBlock = meta.story({
  args: { path: `${readerPath}?edition=1&loc=${clippedLocatorParam}#welcome-to-arrakis` },
  parameters: { database: db(withClippedRulebookReader) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const storyWindow = canvasElement.ownerDocument.defaultView;
    if (!storyWindow) {
      throw new Error('Rulebook reader Story requires a browser Window');
    }
    await expect(
      page.findByRole('button', { name: 'Unpin linked target' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    const target = canvasElement.ownerDocument.querySelector<HTMLElement>('[data-rulebook-block-id="HERA"]');
    const region = target?.closest<HTMLElement>('[data-rulebook-region]');
    const rulebookPage = target?.closest<HTMLElement>('[data-rulebook-page-id="CHAP"]');
    if (!target || !region || !rulebookPage) {
      throw new Error('Clipped reader Story could not find its target geometry');
    }
    await waitFor(() => expect(target).toHaveAttribute('data-rulebook-locator-target', 'true'), {
      timeout: SETTLE_TIMEOUT_MS,
    });
    /* The reveal comes RULEBOOK_TARGET_RECOVERY_MS after the mark, and scrolls the clipped Page's bottom edge to the viewport's. */
    await waitFor(
      () => expect(Math.abs(rulebookPage.getBoundingClientRect().bottom - storyWindow.innerHeight)).toBeLessThan(1),
      { timeout: SETTLE_TIMEOUT_MS }
    );
    await expect(rulebookPage.dataset.rulebookPageId).toBe('CHAP');
    await expect(target.getBoundingClientRect().bottom).toBeGreaterThan(region.getBoundingClientRect().bottom);
    await expect(page.queryByText('Part of this Block will not be visible in the published Rulebook.')).toBeNull();
  },
});
