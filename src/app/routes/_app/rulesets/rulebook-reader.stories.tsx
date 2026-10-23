import preview from '@sb/preview';
import { createRulebookStarterContents } from '@shared/rulebooks/fixtures';
import { projectRulebookRenderDocument } from '@shared/rulebooks/projectRenderDocument';
import { DEFAULT_RULEBOOK_SETTINGS } from '@shared/rulebooks/settings';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { db } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { StorybookPage, syncPreviewFrameHash } from '../../storybook';
import { RULEBOOK_TARGET_RECOVERY_MS } from './$rulesetSlug/rulebooks/$rulebookSlug/rulebookClipping';
import {
  buildTextFragmentDirective,
  encodeRulebookTextLocator,
  locatorFromRulebookSelection,
  resolveRulebookTextLocator,
} from './$rulesetSlug/rulebooks/$rulebookSlug/rulebookReaderLinks';
import type { RulebookTextFragment } from './$rulesetSlug/rulebooks/$rulebookSlug/rulebookReaderLinks';
import {
  readerPath,
  movementLocator,
  movementLocatorParam,
  SETTLE_TIMEOUT_MS,
  withRulebookReader,
} from './rulebook-reader.stories.fixture';

const staleLocator = encodeRulebookTextLocator({
  ...movementLocator,
  exact: 'Words removed from this Edition',
});
const missingLocator = encodeRulebookTextLocator({
  v: 1,
  path: [{ kind: 'page', id: 'ZZZZ' }],
  exact: 'Missing Page',
});
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

async function expectTextFragmentHighlights(storyWindow: Window, fragment: RulebookTextFragment) {
  storyWindow.getSelection()?.removeAllRanges();
  storyWindow.scrollTo({ top: 0 });
  await new Promise<void>((resolve) => storyWindow.requestAnimationFrame(() => resolve()));
  await expect(storyWindow.scrollY).toBe(0);
  try {
    storyWindow.location.hash = `:~:${buildTextFragmentDirective(fragment)}`;
    await waitFor(() => expect(storyWindow.scrollY).toBeGreaterThan(0), { timeout: SETTLE_TIMEOUT_MS });
  } finally {
    storyWindow.history.replaceState(
      storyWindow.history.state,
      '',
      `${storyWindow.location.pathname}${storyWindow.location.search}`
    );
  }
}

function selectRulebookRange(storyWindow: Window, start: Node | null | undefined, end: Node | null | undefined) {
  const selection = storyWindow.getSelection();
  if (!start || !end || !selection) {
    throw new Error('Rendered Rulebook selection boundary is missing');
  }
  const range = storyWindow.document.createRange();
  range.setStart(start, 0);
  range.setEnd(end, end.textContent?.length ?? 0);
  selection.removeAllRanges();
  selection.addRange(range);
  const locator = locatorFromRulebookSelection(selection);
  if (!locator.ok) {
    throw new Error(locator.message);
  }
  return locator;
}

async function prepareTargetRecovery(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const storyWindow = canvasElement.ownerDocument.defaultView;
  if (!storyWindow) {
    throw new Error('Rulebook reader Story requires a browser Window');
  }
  await expect(page.findByRole('button', { name: 'Unpin linked target' }, { timeout: 30_000 })).resolves.toBeVisible();
  await userEvent.click(page.getByRole('button', { name: 'Unpin linked target' }));
  await expect(page.findByText('Tracking', {}, { timeout: SETTLE_TIMEOUT_MS })).resolves.toBeVisible();
  const target = canvasElement.ownerDocument.getElementById('markers-and-tokens');
  if (!target) {
    throw new Error('Rulebook reader recovery target is missing');
  }
  const originalBounds = target.getBoundingClientRect.bind(target);
  const originalScrollIntoView = target.scrollIntoView.bind(target);
  const scrollIntoView = fn();
  /* A DOMRect's fields are prototype getters, so spreading one copies none of them; a new rect keeps the target's horizontal span. */
  target.getBoundingClientRect = () => {
    const bounds = originalBounds();
    return new DOMRect(bounds.x, storyWindow.innerHeight + 200, bounds.width, 200);
  };
  target.scrollIntoView = scrollIntoView;
  return {
    page,
    storyWindow,
    scrollIntoView,
    restore: () => {
      target.getBoundingClientRect = originalBounds;
      target.scrollIntoView = originalScrollIntoView;
    },
  };
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

export const StaleSelectedText = meta.story({
  args: { path: `${readerPath}?loc=${staleLocator}` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText(/The words changed, but the stable Page or Block link/, {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Unpin linked target' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Movement' })).toBeVisible();
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

export const HostileLocator = meta.story({
  args: { path: `${readerPath}?loc=%3Cscript%3Ereader-locator-marker%3C%2Fscript%3E` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('alert', {}, { timeout: 30_000 })).resolves.toHaveTextContent(
      'The link contains an invalid or oversized locator'
    );
    await expect(canvasElement.ownerDocument.body).not.toHaveTextContent('<script>reader-locator-marker</script>');
    await expect(
      [...canvasElement.ownerDocument.body.querySelectorAll('script')].some((script) =>
        script.textContent?.includes('reader-locator-marker')
      )
    ).toBe(false);
  },
});

export const MissingLocator = meta.story({
  args: { path: `${readerPath}?loc=${missingLocator}` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('alert', {}, { timeout: 30_000 })).resolves.toHaveTextContent(
      'The linked target does not exist'
    );
    await expect(page.getByRole('heading', { name: 'The gathered rules' })).toBeVisible();
  },
});

export const PageScopedSelectedTextLink = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const storyWindow = canvasElement.ownerDocument.defaultView;
    if (!storyWindow) {
      throw new Error('Rulebook reader Story requires a browser Window');
    }
    const [heading] = await page.findAllByRole('heading', { name: 'Movement', level: 1 }, { timeout: 30_000 });
    const finalText = page.getAllByText('The storm closes the boundary between its two sectors.')[0];
    const start = heading?.firstChild;
    const end = finalText?.firstChild;
    const locator = selectRulebookRange(storyWindow, start, end);
    const contents = createRulebookStarterContents();
    const renderDocument = projectRulebookRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS);

    await expect(locator.locator.path).toEqual([{ kind: 'page', id: 'RULE' }]);
    await expect(
      resolveRulebookTextLocator(contents, renderDocument, { status: 'valid', locator: locator.locator })
    ).toMatchObject({
      status: 'matched',
      pageId: 'RULE',
    });
    await expectTextFragmentHighlights(storyWindow, locator.textFragment);
  },
});

export const BlockSelectedTextHighlightsAcrossContainers = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const storyWindow = canvasElement.ownerDocument.defaultView;
    if (!storyWindow) {
      throw new Error('Rulebook reader Story requires a browser Window');
    }
    const heading = await page.findByRole('heading', { name: 'Movement sequence' }, { timeout: 30_000 });
    const paragraph = page.getAllByText('Choose a troop, choose an adjacent destination, then resolve the move.')[0];
    const start = heading.firstChild;
    const end = paragraph?.firstChild;
    const locator = selectRulebookRange(storyWindow, start, end);
    await expectTextFragmentHighlights(storyWindow, locator.textFragment);
  },
});

export const MeaningfulScrollCancelsTargetRecovery = meta.story({
  args: { path: `${readerPath}?loc=${movementLocatorParam}#movement` },
  play: async ({ canvasElement }) => {
    const { page, restore, scrollIntoView, storyWindow } = await prepareTargetRecovery(canvasElement);
    try {
      storyWindow.location.hash = 'markers-and-tokens';
      await expect(
        page.findByRole('button', { name: 'Unpin linked target' }, { timeout: 30_000 })
      ).resolves.toBeVisible();
      storyWindow.dispatchEvent(new WheelEvent('wheel'));
      storyWindow.dispatchEvent(new Event('scroll'));
      /*
       * A negative has nothing to poll for: the wheel cancelled the reveal timer, and the only evidence is that the timer's moment passes without a scroll.
       * So this waits the reader's own delay with margin rather than a guess at it, and can fail only by seeing the scroll, never by running out of time.
       * The sibling story below proves the same arrangement does scroll when nothing cancels it.
       */
      await new Promise((resolve) => storyWindow.setTimeout(resolve, RULEBOOK_TARGET_RECOVERY_MS * 2));
      await expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  },
});

export const ControlKeyKeepsTargetRecovery = meta.story({
  args: { path: `${readerPath}?loc=${movementLocatorParam}#movement` },
  play: async ({ canvasElement }) => {
    const { page, restore, scrollIntoView, storyWindow } = await prepareTargetRecovery(canvasElement);
    try {
      storyWindow.location.hash = 'markers-and-tokens';
      await expect(
        page.findByRole('button', { name: 'Unpin linked target' }, { timeout: 30_000 })
      ).resolves.toBeVisible();
      page
        .getByRole('button', { name: 'Choose Edition' })
        .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
      /* The reveal fires RULEBOOK_TARGET_RECOVERY_MS after the mark; a key inside a control must not have cancelled it. */
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledOnce(), { timeout: SETTLE_TIMEOUT_MS });
    } finally {
      restore();
    }
  },
});
