import preview from '@sb/preview';
import { createRulebookEditorialStarterContents } from '@shared/rulebooks/fixtures';
import { rulebookNameKey } from '@shared/rulebooks/metadata';
import { projectRulebookRenderDocument } from '@shared/rulebooks/projectRenderDocument';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { db, ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { StorybookPage, syncPreviewFrameHash } from '../../storybook';
import { RULEBOOK_TARGET_RECOVERY_MS } from './$rulesetSlug/rulebooks/$rulebookSlug/rulebookClipping';
import {
  buildTextFragmentDirective,
  encodeRulebookTextLocator,
  locatorFromRulebookSelection,
  parseRulebookTextLocator,
  resolveRulebookTextLocator,
} from './$rulesetSlug/rulebooks/$rulebookSlug/rulebookReaderLinks';
import type {
  RulebookTextFragment,
  RulebookTextLocator,
} from './$rulesetSlug/rulebooks/$rulebookSlug/rulebookReaderLinks';

const readerPath = '/rulesets/classicrules/rulebooks/rules-of-arrakis';
const movementLocator: RulebookTextLocator = {
  v: 1,
  path: [
    { kind: 'page', id: 'RULE' },
    { kind: 'block', id: 'MVVE' },
  ],
  exact: 'Movement sequence',
  suffix: 'Choose a force',
};
const movementLocatorParam = encodeRulebookTextLocator(movementLocator);
const historicalOnlyLocator = encodeRulebookTextLocator({
  v: 1,
  path: [
    { kind: 'page', id: 'CHAP' },
    { kind: 'block', id: 'HERA' },
  ],
  exact: 'A selected Asset with a short caption.',
});
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
/*
 * Every wait in this file that observes an asynchronous result carries this bound, the same one the mount waits carry.
 * The results arrive from the reader's own timers and from Convex round trips, and on a loaded runner they arrive late: the one-second library default failed nine runs in four days on branches that never touched the reader (#995).
 * A bound is not a cost when the result arrives, and a result that never arrives still fails with the assertion that named it.
 */
const SETTLE_TIMEOUT_MS = 30_000;
const clippedLocatorParam = encodeRulebookTextLocator({
  v: 1,
  path: [
    { kind: 'page', id: 'CHAP' },
    { kind: 'block', id: 'HERA' },
  ],
  exact: clippedCaptionEnding,
});

function withRulebookReader(baseline: StorybookDatabase) {
  const rulebookKey = 'rulebook:reader';
  const editionOne = createRulebookEditorialStarterContents();
  const editionTwo = structuredClone(editionOne);
  editionTwo.pagesById[editionTwo.pageOrder[0]]!.title = 'The gathered rules';
  const historicalOnlyPage = editionTwo.pagesById.CHAP;
  if (historicalOnlyPage?.layoutId !== 'chapter-opener') {
    throw new Error('The Rulebook reader fixture needs its chapter opener');
  }
  historicalOnlyPage.blockOrderByRegion.feature = [];
  delete historicalOnlyPage.blocksById.HERA;
  baseline.rulebooks.push({
    $key: rulebookKey,
    ruleset_id: ref('ruleset:classicrules'),
    name: 'Rules of Arrakis',
    name_key: rulebookNameKey('Rules of Arrakis'),
    slug: 'rules-of-arrakis',
    sort_order: 0,
    current_edition_number: 2,
    created_by: ref('storybook-viewer'),
    created_at: '2026-07-01T12:00:00.000Z',
    updated_at: '2026-08-31T12:00:00.000Z',
    is_deleted: false,
    deleted_at: null,
  });
  baseline.rulebook_editions.push(
    {
      $key: 'rulebook-edition:reader:1',
      rulebook_id: ref(rulebookKey),
      edition_number: 1,
      created_by: ref('storybook-viewer'),
      created_at: '2026-07-01T12:00:00.000Z',
    },
    {
      $key: 'rulebook-edition:reader:2',
      rulebook_id: ref(rulebookKey),
      edition_number: 2,
      created_by: ref('storybook-viewer'),
      created_at: '2026-08-31T12:00:00.000Z',
    }
  );
  baseline.rulebook_edition_contents.push(
    {
      edition_id: ref('rulebook-edition:reader:1'),
      contents: editionOne,
    },
    {
      edition_id: ref('rulebook-edition:reader:2'),
      contents: editionTwo,
    }
  );
  return baseline;
}

function withClippedRulebookReader(baseline: StorybookDatabase) {
  withRulebookReader(baseline);
  const editionOne = baseline.rulebook_edition_contents.at(-2)?.contents;
  const block = editionOne?.pagesById.CHAP?.blocksById.HERA;
  if (block?.kind !== 'asset-figure') {
    throw new Error('Clipped reader Story needs Edition 1 chapter artwork');
  }
  block.text = `${'The caption continues below the fixed Page. '.repeat(80)}${clippedCaptionEnding}`;
  return baseline;
}

async function expectTextFragmentHighlights(storyWindow: Window, fragment: RulebookTextFragment) {
  storyWindow.getSelection()?.removeAllRanges();
  storyWindow.scrollTo({ top: 0 });
  await new Promise<void>((resolve) => storyWindow.requestAnimationFrame(() => resolve()));
  expect(storyWindow.scrollY).toBe(0);
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

async function trackReaderScroll(storyWindow: Window) {
  storyWindow.dispatchEvent(new Event('scroll'));
  /* Let the reader's tracking frame run and React paint its result before checking feedback. */
  await new Promise<void>((resolve) =>
    storyWindow.requestAnimationFrame(() => storyWindow.requestAnimationFrame(() => resolve()))
  );
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
  target.getBoundingClientRect = () => ({
    ...originalBounds(),
    top: storyWindow.innerHeight + 200,
    bottom: storyWindow.innerHeight + 400,
  });
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
    expect(page.getByText('2 Editions')).toBeVisible();
    const list = within(page.getByRole('list', { name: 'Editions' }));
    const items = list.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Edition 2')).toBeVisible();
    expect(within(items[0]!).getByText('Current')).toBeVisible();
    expect(within(items[1]!).queryByText('Current')).not.toBeInTheDocument();
    expect(list.getByRole('link', { name: 'Read Edition 2' })).toHaveAttribute('href', readerPath);
    expect(list.getByRole('link', { name: 'Read Edition 1' })).toHaveAttribute('href', `${readerPath}?edition=1`);
    expect(list.getAllByText('HTML preparing')).toHaveLength(2);
    expect(list.getAllByText('PDF preparing')).toHaveLength(2);
  },
});

export const CurrentEdition = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.getByText('Edition 2')).toBeVisible();
    expect(page.getByRole('heading', { name: 'The gathered rules' })).toBeVisible();
    const pageNavigation = within(page.getByRole('navigation', { name: 'Rulebook Pages' }));
    expect(pageNavigation.getAllByRole('link', { current: 'page' })).toHaveLength(1);
    expect(pageNavigation.getByRole('link', { current: 'page' })).toHaveAttribute('data-active', 'true');
    const articles = page.getAllByRole('article');
    expect(articles).toHaveLength(3);
    expect(canvasElement.ownerDocument.defaultView?.getComputedStyle(articles[1]!).contentVisibility).toBe('auto');
  },
});

export const HistoricalEdition = meta.story({
  args: { path: `${readerPath}?edition=1` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    /* The label goes through the dates module, so this reads the same in every locale and time zone rather than only in the one the runner happens to use. */
    expect(page.getByRole('combobox', { name: 'Rulebook Edition' })).toHaveValue('Edition 1, Jul 1, 2026');
    expect(page.getByRole('heading', { name: 'Welcome to Arrakis' })).toBeVisible();
    expect(page.queryByRole('heading', { name: 'The gathered rules' })).not.toBeInTheDocument();
    expect(page.getByRole('link', { name: /Movement/ })).toHaveAttribute('href', `${readerPath}?edition=1#movement`);
  },
});

export const SelectingCurrentEditionUsesCanonicalUrl = meta.story({
  args: { path: `${readerPath}?edition=1` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const edition = await page.findByRole('combobox', { name: 'Rulebook Edition' }, { timeout: 30_000 });
    await userEvent.click(edition);
    await userEvent.click(page.getByRole('option', { name: 'Edition 2, Aug 31, 2026' }));
    await expect(
      page.findByRole('heading', { name: 'The gathered rules' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    /*
     * The heading arrives with the new Edition's content, but the selector carries its own value and the
     * links are rebuilt from the rewritten address, so both settle after it rather than with it.
     */
    await waitFor(() => expect(edition).toHaveValue('Edition 2, Aug 31, 2026'), { timeout: SETTLE_TIMEOUT_MS });
    await waitFor(
      () => expect(page.getByRole('link', { name: /Movement/ })).toHaveAttribute('href', `${readerPath}#movement`),
      { timeout: SETTLE_TIMEOUT_MS }
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
    expect(page.getByRole('button', { name: 'Unpin linked target' })).toBeVisible();
    expect(page.getByRole('heading', { name: 'Movement' })).toBeVisible();
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
    expect(rulebookPage.dataset.rulebookPageId).toBe('CHAP');
    expect(target.getBoundingClientRect().bottom).toBeGreaterThan(region.getBoundingClientRect().bottom);
    expect(page.queryByText('Part of this Block will not be visible in the published Rulebook.')).toBeNull();
  },
});

export const HostileLocator = meta.story({
  args: { path: `${readerPath}?loc=%3Cscript%3Ereader-locator-marker%3C%2Fscript%3E` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('alert', {}, { timeout: 30_000 })).resolves.toHaveTextContent(
      'The link contains an invalid or oversized locator'
    );
    expect(canvasElement.ownerDocument.body).not.toHaveTextContent('<script>reader-locator-marker</script>');
    expect(
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
    expect(page.getByRole('heading', { name: 'The gathered rules' })).toBeVisible();
  },
});

export const SelectedTextLink = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const storyWindow = canvasElement.ownerDocument.defaultView;
    if (!storyWindow) {
      throw new Error('Rulebook reader Story requires a browser Window');
    }
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(storyWindow.navigator, 'clipboard');
    const writeText = fn(async (_value: string) => undefined);
    Object.defineProperty(storyWindow.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const heading = await page.findByRole('heading', { name: 'Movement sequence' }, { timeout: 30_000 });
    const liveRegion = page.getByRole('status');
    const announcements: string[] = [];
    const observer = new storyWindow.MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.textContent === 'Selected-text link copied.') {
            announcements.push(node.textContent);
          }
        }
      }
    });
    observer.observe(liveRegion, { childList: true });
    const selection = storyWindow.getSelection();
    const range = canvasElement.ownerDocument.createRange();
    range.selectNodeContents(heading);
    selection?.removeAllRanges();
    selection?.addRange(range);
    try {
      await userEvent.click(page.getByRole('button', { name: 'Copy link to selected text' }));
      await waitFor(() => expect(announcements).toHaveLength(1), { timeout: SETTLE_TIMEOUT_MS });
      await userEvent.click(page.getByRole('button', { name: 'Copy link to selected text' }));
      await waitFor(() => expect(announcements).toHaveLength(2), { timeout: SETTLE_TIMEOUT_MS });
      page.getByRole('article', { name: 'Rulebook page: Markers and tokens' }).scrollIntoView({ block: 'start' });
      await trackReaderScroll(storyWindow);
      await waitFor(
        () => expect(page.getByRole('link', { name: /Markers and tokens/ })).toHaveAttribute('aria-current', 'page'),
        { timeout: SETTLE_TIMEOUT_MS }
      );
      await waitFor(() => expect(liveRegion).toBeEmptyDOMElement(), { timeout: SETTLE_TIMEOUT_MS });
      expect(
        page.queryByText('Selected-text link copied.', { selector: '[aria-hidden="true"]' })
      ).not.toBeInTheDocument();
      expect(writeText).toHaveBeenCalledTimes(2);
      const copiedUrl = new URL(writeText.mock.calls[0]![0]);
      expect(copiedUrl.origin).toBe(storyWindow.location.origin);
      expect(copiedUrl.pathname).toBe(storyWindow.location.pathname);
      expect(copiedUrl.searchParams.has('edition')).toBe(false);
      expect(parseRulebookTextLocator(copiedUrl.searchParams.get('loc') ?? undefined)).toMatchObject({
        status: 'valid',
        locator: {
          path: [
            { kind: 'page', id: 'RULE' },
            { kind: 'block', id: 'MVVE' },
          ],
        },
      });
      expect(copiedUrl.hash).toMatch(/^#movement:~:text=/);
    } finally {
      observer.disconnect();
      if (clipboardDescriptor) {
        Object.defineProperty(storyWindow.navigator, 'clipboard', clipboardDescriptor);
      } else {
        Reflect.deleteProperty(storyWindow.navigator, 'clipboard');
      }
    }
  },
});

export const CopyFeedbackSurvivesSamePageTracking = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const storyWindow = canvasElement.ownerDocument.defaultView;
    if (!storyWindow) {
      throw new Error('Rulebook reader Story requires a browser Window');
    }
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    storyWindow.scrollTo({ top: 0 });
    await trackReaderScroll(storyWindow);
    const firstPage = page.getByRole('link', { name: /The gathered rules/ });
    await waitFor(() => expect(firstPage).toHaveAttribute('aria-current', 'page'), { timeout: SETTLE_TIMEOUT_MS });

    storyWindow.getSelection()?.removeAllRanges();
    await userEvent.click(page.getByRole('button', { name: 'Copy link to selected text' }));
    const feedback = await page.findByText(
      'Select some Rulebook text first.',
      { selector: '[aria-hidden="true"]' },
      { timeout: SETTLE_TIMEOUT_MS }
    );
    await trackReaderScroll(storyWindow);
    expect(firstPage).toHaveAttribute('aria-current', 'page');
    expect(feedback).toBeVisible();
    expect(page.getByRole('status')).toHaveTextContent('Select some Rulebook text first.');

    page.getByRole('article', { name: 'Rulebook page: Movement' }).scrollIntoView({ block: 'start' });
    await trackReaderScroll(storyWindow);
    await waitFor(() => expect(page.getByRole('link', { name: /Movement/ })).toHaveAttribute('aria-current', 'page'), {
      timeout: SETTLE_TIMEOUT_MS,
    });
    expect(feedback).not.toBeInTheDocument();
    expect(page.getByRole('status')).toBeEmptyDOMElement();
  },
});

export const PageScopedSelectedTextLink = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const storyWindow = canvasElement.ownerDocument.defaultView;
    if (!storyWindow) {
      throw new Error('Rulebook reader Story requires a browser Window');
    }
    const eyebrow = await page.findByText('Rules page', {}, { timeout: 30_000 });
    const finalText = page.getAllByText('The storm closes the boundary between its two sectors.')[0];
    const start = eyebrow.firstChild;
    const end = finalText?.firstChild;
    const locator = selectRulebookRange(storyWindow, start, end);
    const contents = createRulebookEditorialStarterContents();
    const renderDocument = projectRulebookRenderDocument(contents, {});

    expect(locator.locator.path).toEqual([{ kind: 'page', id: 'RULE' }]);
    expect(
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
    const paragraph = page.getAllByText('Choose a force, choose an adjacent destination, then resolve the move.')[0];
    const start = heading.firstChild;
    const end = paragraph?.firstChild;
    const locator = selectRulebookRange(storyWindow, start, end);
    await expectTextFragmentHighlights(storyWindow, locator.textFragment);
  },
});

export const AnchoredPage = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const storyWindow = canvasElement.ownerDocument.defaultView;
    if (!storyWindow) {
      throw new Error('Rulebook reader Story requires a browser Window');
    }
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    storyWindow.location.hash = 'movement';
    await expect(
      page.findByRole('button', { name: 'Unpin linked target' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Unpin linked target' }));
    await expect(page.findByText('Tracking', {}, { timeout: SETTLE_TIMEOUT_MS })).resolves.toBeVisible();
    await waitFor(() => expect(page.queryByRole('button', { name: 'Unpin linked target' })).not.toBeInTheDocument(), {
      timeout: SETTLE_TIMEOUT_MS,
    });

    storyWindow.location.hash = 'missing-page';
    await expect(page.findByRole('alert', {}, { timeout: 30_000 })).resolves.toHaveTextContent(
      'The linked target does not exist'
    );
    storyWindow.history.replaceState(
      storyWindow.history.state,
      '',
      `${storyWindow.location.pathname}${storyWindow.location.search}`
    );
  },
});

export const SidebarNavigationStaysInDocument = meta.story({
  args: { path: `${readerPath}?loc=${movementLocatorParam}#movement` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const storyDocument = canvasElement.ownerDocument;
    const link = await page.findByRole('link', { name: /Markers and tokens/ }, { timeout: 30_000 });
    expect(link).toHaveAttribute('href', `${readerPath}?loc=${movementLocatorParam}#markers-and-tokens`);

    let routerIntercepted = false;
    const observeNavigation = (event: MouseEvent) => {
      routerIntercepted = event.defaultPrevented;
      event.preventDefault();
    };
    storyDocument.addEventListener('click', observeNavigation, { once: true });
    await userEvent.click(link);
    expect(routerIntercepted).toBe(true);
    const edition = page.getByRole('combobox', { name: 'Rulebook Edition' });
    await userEvent.click(edition);
    await userEvent.click(page.getByRole('option', { name: 'Edition 1, Jul 1, 2026' }));
    await waitFor(() => expect(edition).toHaveValue('Edition 1, Jul 1, 2026'), { timeout: SETTLE_TIMEOUT_MS });
    const nextPageHref = page.getByRole('link', { name: /Markers and tokens/ }).getAttribute('href');
    if (!nextPageHref) {
      throw new Error('Rulebook reader Page link is missing its href');
    }
    const nextPageUrl = new URL(nextPageHref, 'https://dune.zone');
    expect(nextPageUrl.searchParams.get('edition')).toBe('1');
    expect(nextPageUrl.searchParams.get('loc')).toBe(movementLocatorParam);
  },
});

export const ScrollTrackingWritesOnlyChangedAnchors = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const storyWindow = canvasElement.ownerDocument.defaultView;
    if (!storyWindow) {
      throw new Error('Rulebook reader Story requires a browser Window');
    }
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    const unpin = page.queryByRole('button', { name: 'Unpin linked target' });
    if (unpin) {
      await userEvent.click(unpin);
      await expect(page.findByText('Tracking', {}, { timeout: SETTLE_TIMEOUT_MS })).resolves.toBeVisible();
    }
    storyWindow.scrollTo({ top: 0 });
    await new Promise<void>((resolve) => storyWindow.requestAnimationFrame(() => resolve()));
    const originalReplaceState = storyWindow.history.replaceState;
    originalReplaceState.call(
      storyWindow.history,
      storyWindow.history.state,
      '',
      `${storyWindow.location.pathname}${storyWindow.location.search}`
    );
    const replaceState = fn((...args: Parameters<History['replaceState']>) =>
      originalReplaceState.apply(storyWindow.history, args)
    );
    storyWindow.history.replaceState = replaceState;
    try {
      storyWindow.dispatchEvent(new WheelEvent('wheel'));
      for (let index = 0; index < 4; index += 1) {
        storyWindow.dispatchEvent(new Event('scroll'));
        await new Promise<void>((resolve) => storyWindow.requestAnimationFrame(() => resolve()));
      }
      expect(replaceState).toHaveBeenCalledTimes(1);
      expect(new URL(storyWindow.location.href).hash).toBe('#welcome-to-arrakis');
    } finally {
      storyWindow.history.replaceState = originalReplaceState;
    }
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
      expect(scrollIntoView).not.toHaveBeenCalled();
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
        .getByRole('combobox', { name: 'Rulebook Edition' })
        .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
      /* The reveal fires RULEBOOK_TARGET_RECOVERY_MS after the mark; a key inside a control must not have cancelled it. */
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledOnce(), { timeout: SETTLE_TIMEOUT_MS });
    } finally {
      restore();
    }
  },
});

export const EditionChangeDropsAnUnresolvedPin = meta.story({
  args: { path: `${readerPath}?edition=1&loc=${historicalOnlyLocator}#welcome-to-arrakis` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const storyWindow = canvasElement.ownerDocument.defaultView;
    if (!storyWindow) {
      throw new Error('Rulebook reader Story requires a browser Window');
    }
    await expect(
      page.findByRole('button', { name: 'Unpin linked target' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    /* The pinned Block sits below the first Page's anchor; the reveal brings it into the viewport before the story touches anything. */
    const pinnedBlock = canvasElement.ownerDocument.querySelector<HTMLElement>('[data-rulebook-block-id="HERA"]');
    if (!pinnedBlock) {
      throw new Error('The pinned Block is missing from the historical Edition');
    }
    await waitFor(
      () => {
        const bounds = pinnedBlock.getBoundingClientRect();
        expect(bounds.top).toBeGreaterThanOrEqual(0);
        expect(bounds.bottom).toBeLessThanOrEqual(storyWindow.innerHeight);
      },
      { timeout: SETTLE_TIMEOUT_MS }
    );
    storyWindow.getSelection()?.removeAllRanges();
    await userEvent.click(page.getByRole('button', { name: 'Copy link to selected text' }));
    await expect(
      page.findByText('Select some Rulebook text first.', { selector: '[aria-hidden="true"]' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    const edition = page.getByRole('combobox', { name: 'Rulebook Edition' });
    await userEvent.click(edition);
    await userEvent.click(page.getByRole('option', { name: 'Edition 2, Aug 31, 2026' }));
    await expect(page.findByRole('alert', {}, { timeout: 30_000 })).resolves.toHaveTextContent(
      'The linked target does not exist'
    );
    await expect(page.findByText('Tracking', {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('button', { name: 'Unpin linked target' })).not.toBeInTheDocument();
    expect(page.queryByText('Select some Rulebook text first.')).not.toBeInTheDocument();
  },
});

/**
 * A rejected `?edition` leaves the reader on the current Edition instead of an error frame.
 * The value has to be rejected by `validateSearch` and then not show through: a route's search is the parent match's search merged with the child's result, so a validator that omits a rejected key lets the raw one reach the loader and the Convex query.
 * Asserting the Edition selector rather than the heading is what makes that visible, since a reader that fell through to the raw value names it here.
 */
export const RejectedEditionFallsBackToCurrent = meta.story({
  args: { path: `${readerPath}?edition=abc` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.getByRole('combobox', { name: 'Rulebook Edition' })).toHaveValue('Edition 2, Aug 31, 2026');
  },
});
