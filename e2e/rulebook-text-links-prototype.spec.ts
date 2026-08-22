import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { buildRulebookTextShareUrl } from '../src/app/routes/_app/-rulebookTextLinksPrototype';

const prototypePath = '/__rulebook-text-links-prototype';
const baseUrl = `http://127.0.0.1:4175${prototypePath}`;
const repeatedLocator = {
  v: 1,
  path: [
    { kind: 'page', id: 'page-2' },
    { kind: 'block', id: 'block-storm-rule' },
  ],
  exact: 'The storm belongs to no one.',
  prefix: 'After the shields settle,',
  suffix: 'Carry the warning west.',
} satisfies Parameters<typeof buildRulebookTextShareUrl>[1];

function requireShareUrl(
  locator: Parameters<typeof buildRulebookTextShareUrl>[1],
  variant?: Parameters<typeof buildRulebookTextShareUrl>[2]
) {
  const result = buildRulebookTextShareUrl(baseUrl, locator, variant);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.url;
}

async function selectElementText(page: Page, selector: string, phrase: string) {
  await page.locator(selector).evaluate((element, selectedPhrase) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
      const start = node.data.indexOf(selectedPhrase);
      if (start >= 0) {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + selectedPhrase.length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return;
      }
      node = walker.nextNode() as Text | null;
    }
    throw new Error('Could not find text to select');
  }, phrase);
}

async function selectPageRange(page: Page) {
  await page.locator('#storm-rule').evaluate((startElement) => {
    const startRoot = startElement.querySelector('h3');
    const endRoot = document.querySelector('[data-rulebook-segment-id="procedure-west-text"]');
    const start = startRoot
      ? (document.createTreeWalker(startRoot, NodeFilter.SHOW_TEXT).nextNode() as Text | null)
      : null;
    const end = endRoot ? (document.createTreeWalker(endRoot, NodeFilter.SHOW_TEXT).nextNode() as Text | null) : null;
    if (!start || !end) {
      throw new Error('Missing Page-spanning selection nodes');
    }
    const range = document.createRange();
    range.setStart(start, 0);
    range.setEnd(end, end.data.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}

async function createShareUrl(page: Page) {
  await page.getByRole('button', { name: 'Create link from selection' }).click();
  const shareUrl = await page.getByLabel('Share URL').textContent();
  expect(shareUrl).toBeTruthy();
  return shareUrl!;
}

test('semantic target text precedes lazy visual content on a fresh pinned load', async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as Window & {
      rulebookLazyObservation?: { semanticBeforeVisual: boolean; visualAfterSemantic: boolean };
    };
    testWindow.rulebookLazyObservation = { semanticBeforeVisual: false, visualAfterSemantic: false };
    const observe = () => {
      const rulePage = document.getElementById('page-storm');
      const semanticReady = rulePage?.textContent?.includes('The storm belongs to no one.') ?? false;
      const visualReady = Boolean(rulePage?.querySelector(':scope > [aria-hidden="true"]'));
      if (semanticReady && !visualReady) {
        testWindow.rulebookLazyObservation!.semanticBeforeVisual = true;
      }
      if (visualReady && testWindow.rulebookLazyObservation!.semanticBeforeVisual) {
        testWindow.rulebookLazyObservation!.visualAfterSemantic = true;
      }
    };
    new MutationObserver(observe).observe(document, { childList: true, subtree: true });
  });
  await page.goto(requireShareUrl(repeatedLocator), { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.locator('#storm-rule')).toBeAttached();
  await expect(page.locator('#page-aftermath')).toContainText('The selected text remains searchable throughout.');
  const visualDecoration = page.locator('#page-storm > [aria-hidden="true"]');
  await expect(visualDecoration).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as Window & {
            rulebookLazyObservation?: { semanticBeforeVisual: boolean; visualAfterSemantic: boolean };
          }
        ).rulebookLazyObservation
    )
  ).toEqual({ semanticBeforeVisual: true, visualAfterSemantic: true });
  await expect(page.locator('#storm-rule')).toHaveAttribute('data-locator-target', 'true');
});

test('browser-native movement and application recovery remain observably distinct', async ({ page }) => {
  const nativeLocator = {
    v: 1,
    path: [
      { kind: 'page', id: 'page-2' },
      { kind: 'block', id: 'block-unicode-rule' },
    ],
    exact: 'naïve seers agree',
  } satisfies Parameters<typeof buildRulebookTextShareUrl>[1];
  await page.goto(requireShareUrl(nativeLocator), { waitUntil: 'domcontentloaded' });

  expect(await page.evaluate(() => 'fragmentDirective' in document)).toBe(true);
  await expect(page.getByText('browser native navigation', { exact: true })).toBeVisible();
  await expect(page.locator('#unicode-rule')).toBeInViewport();

  const recoveryUrl = new URL(requireShareUrl(repeatedLocator));
  recoveryUrl.hash = 'missing-anchor:~:text=words-that-do-not-exist';
  await page.goto(recoveryUrl.toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('application recovery', { exact: true })).toBeVisible();
  await expect(page.locator('#storm-rule')).toBeInViewport();
});

test('a real repeated-text Selection creates a fresh link for the intended Block', async ({ page }) => {
  await page.goto(prototypePath);
  await selectElementText(page, '#storm-rule', 'The storm belongs to no one.');
  const shareUrl = await createShareUrl(page);

  expect(shareUrl).toContain('#storm-rule:~:text=');
  await page.goto(shareUrl);
  await expect(page.locator('#storm-rule')).toHaveAttribute('data-locator-target', 'true');
  await expect(page.locator('#storm-rumour')).not.toHaveAttribute('data-locator-target', 'true');
});

test('a real Page-spanning Selection resolves through ordered semantic segments', async ({ page }) => {
  await page.goto(prototypePath);
  await selectPageRange(page);
  const shareUrl = await createShareUrl(page);

  expect(new URL(shareUrl).hash).toContain('#page-storm:~:text=');
  await page.goto(shareUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('status')).toContainText('The stable anchor and selected text agree');
  await expect(page.locator('#page-storm')).toHaveAttribute('data-locator-target', 'true');

  await page.goto(prototypePath);
  await page.locator('#page-aftermath').evaluate((pageElement) => {
    const start = pageElement.querySelector('[data-rulebook-segment-id="page-3-title-segment"]')?.firstChild;
    const end = pageElement.querySelector('[data-rulebook-segment-id="block-long-rule-paragraph-1"]')?.firstChild;
    if (!start || !end) {
      throw new Error('Missing oversized Page selection nodes');
    }
    const range = document.createRange();
    range.setStart(start, 0);
    range.setEnd(end, end.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.getByRole('button', { name: 'Create link from selection' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'The selection is too large for a safe share URL. Select a shorter passage.' })
  ).toHaveText('The selection is too large for a safe share URL. Select a shorter passage.');
  await expect(page.getByLabel('Share URL')).toHaveCount(0);
});

test('plain Page and Block anchors pin their targets while unknown anchors stay usable', async ({ page }) => {
  for (const target of [
    { hash: '#page-storm', selector: '#page-storm' },
    { hash: '#storm-rule', selector: '#storm-rule' },
  ]) {
    await page.goto(`${baseUrl}${target.hash}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Pinned', { exact: true })).toBeVisible();
    await expect(page.locator(target.selector)).toHaveAttribute('data-locator-target', 'true');
    expect(new URL(page.url()).hash).toBe(target.hash);
  }

  await page.goto(`${baseUrl}#missing-rule`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByText('This link target does not exist in this Rulebook. Page 1 remains available.')
  ).toBeVisible();
  await expect(page.locator('#opening-rule')).toBeVisible();
});

test('fast unpin tracks visible Pages, preserves gaps, and reloads the Page permalink', async ({ page }) => {
  await page.goto(requireShareUrl(repeatedLocator), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Unpin target' }).click();
  await page.locator('#page-aftermath').evaluate((element) => element.scrollIntoView({ block: 'center' }));

  await expect.poll(() => new URL(page.url()).hash).toBe('#page-aftermath');
  expect(new URL(page.url()).searchParams.has('loc')).toBe(false);
  await page.waitForTimeout(900);
  await expect(page.getByText('reader tracking', { exact: true })).toBeVisible();
  const trackedPageHash = new URL(page.url()).hash;
  expect(trackedPageHash).toMatch(/^#page-/);
  await expect(page.locator(trackedPageHash)).toBeInViewport();

  await page.setViewportSize({ width: 500, height: 180 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(() =>
      page.locator('[data-rulebook-page-anchor]').evaluateAll((pages) =>
        pages.some((entry) => {
          const rect = entry.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight;
        })
      )
    )
    .toBe(false);
  const gapHash = new URL(page.url()).hash;
  await page.waitForTimeout(250);
  expect(new URL(page.url()).hash).toBe(gapHash);

  await page.reload();
  await expect(page.getByText('Pinned', { exact: true })).toBeVisible();
  await expect(page.locator(gapHash)).toHaveAttribute('data-locator-target', 'true');
});

test('hostile-looking selected text remains inert through a fresh browser link', async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { prototypeAlertCalls?: number }).prototypeAlertCalls = 0;
    window.alert = () => {
      const testWindow = window as Window & { prototypeAlertCalls?: number };
      testWindow.prototypeAlertCalls = (testWindow.prototypeAlertCalls ?? 0) + 1;
    };
  });
  await page.goto(prototypePath);
  await selectElementText(page, '#hostile-rule', '<script>alert("spice")</script>');
  const shareUrl = await createShareUrl(page);

  expect(shareUrl).not.toContain('<script>');
  await page.goto(shareUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-rulebook-prototype-document] script')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as Window & { prototypeAlertCalls?: number }).prototypeAlertCalls ?? 0)
  ).toBe(0);
});

test('the editor opens the located Page and permits an explicit Page switch', async ({ page }) => {
  await page.goto(requireShareUrl(repeatedLocator, 'editor'));

  await expect(page.locator('[data-rulebook-page-anchor]')).toHaveCount(1);
  await expect(page.locator('#page-storm')).toBeVisible();
  await expect(page.locator('#storm-rule')).toHaveAttribute('data-locator-target', 'true');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(page.locator('#page-aftermath')).toBeVisible();
});
