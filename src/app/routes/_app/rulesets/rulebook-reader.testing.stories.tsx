import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { createRulebookStarterContents } from '@shared/rulebooks/fixtures';
import { projectRulebookRenderDocument } from '@shared/rulebooks/projectRenderDocument';
import { DEFAULT_RULEBOOK_SETTINGS } from '@shared/rulebooks/settings';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { db } from '@db/storybook';

import { StorybookPage, syncPreviewFrameHash } from '../../storybook';
import { RULEBOOK_TARGET_RECOVERY_MS } from './$rulesetSlug/rulebooks/$rulebookSlug/rulebookClipping';
import {
  encodeRulebookTextLocator,
  parseRulebookTextLocator,
  buildTextFragmentDirective,
  locatorFromRulebookSelection,
  resolveRulebookTextLocator,
} from './$rulesetSlug/rulebooks/$rulebookSlug/rulebookReaderLinks';
import type { RulebookTextFragment } from './$rulesetSlug/rulebooks/$rulebookSlug/rulebookReaderLinks';
import {
  readerPath,
  movementLocatorParam,
  SETTLE_TIMEOUT_MS,
  withRulebookReader,
  movementLocator,
} from './rulebook-reader.stories.fixture';

const historicalOnlyLocator = encodeRulebookTextLocator({
  v: 1,
  path: [
    { kind: 'page', id: 'CHAP' },
    { kind: 'block', id: 'HERA' },
  ],
  exact: 'A selected Asset with a short caption.',
});

async function trackReaderScroll(storyWindow: Window) {
  storyWindow.dispatchEvent(new Event('scroll'));
  /* Let the reader's tracking frame run and React paint its result before checking feedback. */
  await new Promise<void>((resolve) =>
    storyWindow.requestAnimationFrame(() => storyWindow.requestAnimationFrame(() => resolve()))
  );
}

const meta = testingPreview.meta({
  title: 'Rulesets/Rulebook reader',
  component: StorybookPage,
  args: { path: readerPath },
  beforeEach: syncPreviewFrameHash,
  parameters: { layout: 'fullscreen', database: db(withRulebookReader) },
});

export const HistoricalEdition = meta.story({
  args: { path: `${readerPath}?edition=1` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    /* The label goes through the dates module, so this reads the same in every locale and time zone rather than only in the one the runner happens to use. */
    await userEvent.click(page.getByRole('button', { name: 'Choose Edition' }));
    await expect(
      waitForFrame(() => page.getByRole('menuitem', { name: 'Edition 1, Jul 1, 2026', current: true }))
    ).resolves.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await expect(page.getByRole('heading', { name: 'Welcome to Arrakis' })).toBeVisible();
    await expect(page.queryByRole('heading', { name: 'The gathered rules' })).not.toBeInTheDocument();
    await expect(page.getByRole('link', { name: /Movement/ })).toHaveAttribute(
      'href',
      `${readerPath}?edition=1#movement`
    );
  },
});

export const SelectingCurrentEditionUsesCanonicalUrl = meta.story({
  args: { path: `${readerPath}?edition=1` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Choose Edition' }, { timeout: 30_000 }));
    await userEvent.click(await waitForFrame(() => page.getByRole('menuitem', { name: 'Edition 2, Aug 31, 2026' })));
    await expect(
      page.findByRole('heading', { name: 'The gathered rules' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    /*
     * The heading arrives with the new Edition's content, but the header's Edition and the links are
     * rebuilt from the rewritten address, so both settle after it rather than with it.
     */
    await waitFor(() => expect(page.getByText('Edition 2', { exact: true })).toBeVisible(), {
      timeout: SETTLE_TIMEOUT_MS,
    });
    await waitFor(
      () => expect(page.getByRole('link', { name: /Movement/ })).toHaveAttribute('href', `${readerPath}#movement`),
      { timeout: SETTLE_TIMEOUT_MS }
    );
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
      await expect(
        page.queryByText('Selected-text link copied.', { selector: '[aria-hidden="true"]' })
      ).not.toBeInTheDocument();
      await expect(writeText).toHaveBeenCalledTimes(2);
      const copiedUrl = new URL(writeText.mock.calls[0]![0]);
      await expect(copiedUrl.origin).toBe(storyWindow.location.origin);
      await expect(copiedUrl.pathname).toBe(storyWindow.location.pathname);
      await expect(copiedUrl.searchParams.has('edition')).toBe(false);
      await expect(parseRulebookTextLocator(copiedUrl.searchParams.get('loc') ?? undefined)).toMatchObject({
        status: 'valid',
        locator: {
          path: [
            { kind: 'page', id: 'RULE' },
            { kind: 'block', id: 'MVVE' },
          ],
        },
      });
      await expect(copiedUrl.hash).toMatch(/^#movement:~:text=/);
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
    await expect(firstPage).toHaveAttribute('aria-current', 'page');
    await expect(feedback).toBeVisible();
    await expect(page.getByRole('status')).toHaveTextContent('Select some Rulebook text first.');

    page.getByRole('article', { name: 'Rulebook page: Movement' }).scrollIntoView({ block: 'start' });
    await trackReaderScroll(storyWindow);
    await waitFor(() => expect(page.getByRole('link', { name: /Movement/ })).toHaveAttribute('aria-current', 'page'), {
      timeout: SETTLE_TIMEOUT_MS,
    });
    await expect(feedback).not.toBeInTheDocument();
    await expect(page.getByRole('status')).toBeEmptyDOMElement();
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
    await expect(link).toHaveAttribute('href', `${readerPath}?loc=${movementLocatorParam}#markers-and-tokens`);

    let routerIntercepted = false;
    const observeNavigation = (event: MouseEvent) => {
      routerIntercepted = event.defaultPrevented;
      event.preventDefault();
    };
    storyDocument.addEventListener('click', observeNavigation, { once: true });
    await userEvent.click(link);
    await expect(routerIntercepted).toBe(true);
    await userEvent.click(page.getByRole('button', { name: 'Choose Edition' }));
    await userEvent.click(await waitForFrame(() => page.getByRole('menuitem', { name: 'Edition 1, Jul 1, 2026' })));
    await waitFor(() => expect(page.getByText('Edition 1', { exact: true })).toBeVisible(), {
      timeout: SETTLE_TIMEOUT_MS,
    });
    const nextPageHref = page.getByRole('link', { name: /Markers and tokens/ }).getAttribute('href');
    if (!nextPageHref) {
      throw new Error('Rulebook reader Page link is missing its href');
    }
    const nextPageUrl = new URL(nextPageHref, 'https://dune.zone');
    await expect(nextPageUrl.searchParams.get('edition')).toBe('1');
    await expect(nextPageUrl.searchParams.get('loc')).toBe(movementLocatorParam);
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
      async () => {
        const bounds = pinnedBlock.getBoundingClientRect();
        await expect(bounds.top).toBeGreaterThanOrEqual(0);
        await expect(bounds.bottom).toBeLessThanOrEqual(storyWindow.innerHeight);
      },
      { timeout: SETTLE_TIMEOUT_MS }
    );
    storyWindow.getSelection()?.removeAllRanges();
    await userEvent.click(page.getByRole('button', { name: 'Copy link to selected text' }));
    await expect(
      page.findByText('Select some Rulebook text first.', { selector: '[aria-hidden="true"]' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Choose Edition' }));
    await userEvent.click(await waitForFrame(() => page.getByRole('menuitem', { name: 'Edition 2, Aug 31, 2026' })));
    await expect(page.findByRole('alert', {}, { timeout: 30_000 })).resolves.toHaveTextContent(
      'The linked target does not exist'
    );
    await expect(page.findByText('Tracking', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Unpin linked target' })).not.toBeInTheDocument();
    await expect(page.queryByText('Select some Rulebook text first.')).not.toBeInTheDocument();
  },
});

/**
 * A rejected `?edition` leaves the reader on the current Edition instead of an error frame.
 * The value has to be rejected by `validateSearch` and then not show through: a route's search is the parent match's search merged with the child's result, so a validator that omits a rejected key lets the raw one reach the loader and the Convex query.
 * Asserting the Edition menu's current entry rather than the heading is what makes that visible, since a reader that fell through to the raw value names it here.
 */
export const RejectedEditionFallsBackToCurrent = meta.story({
  args: { path: `${readerPath}?edition=abc` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Choose Edition' }));
    await expect(
      waitForFrame(() => page.getByRole('menuitem', { name: 'Edition 2, Aug 31, 2026', current: true }))
    ).resolves.toBeInTheDocument();
  },
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
