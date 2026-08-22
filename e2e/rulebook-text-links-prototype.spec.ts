import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  buildRulebookTextShareUrl,
  RULEBOOK_TEXT_LINKS_PROTOTYPE_PATH,
} from '../src/app/routes/_app/-rulebookTextLinksPrototype';
import type { RulebookTextLocator } from '../src/app/routes/_app/-rulebookTextLinksPrototype';

const baseUrl = `http://127.0.0.1:4175${RULEBOOK_TEXT_LINKS_PROTOTYPE_PATH}`;
const repeatedLocator: RulebookTextLocator = {
  v: 1,
  path: [
    { kind: 'page', id: 'page-storm' },
    { kind: 'block', id: 'storm-rule' },
  ],
  exact: 'The storm belongs to no one.',
  prefix: 'After the shields settle,',
  suffix: 'Carry the warning west.',
};

async function selectElementText(page: Page, testId: string, phrase?: string) {
  await page.getByTestId(testId).evaluate((element, selectedPhrase) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Text | null = walker.nextNode() as Text | null;
    while (node) {
      const start = selectedPhrase ? node.data.indexOf(selectedPhrase) : 0;
      if (start >= 0) {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, selectedPhrase ? start + selectedPhrase.length : node.data.length);
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

test('fresh reader load pins the target while all lazy-page text remains in the document', async ({ page }) => {
  await page.goto(buildRulebookTextShareUrl(baseUrl, repeatedLocator));

  await expect(page.getByRole('heading', { name: 'Can selected Rulebook text survive a fresh link?' })).toBeVisible();
  await expect(page.locator('#storm-rule')).toHaveAttribute('data-locator-target', 'true');
  await expect(page.locator('#page-storm')).toHaveAttribute('data-visual-state', 'pinned');
  await expect(page.locator('[data-rulebook-page-anchor]')).toHaveCount(3);
  await expect(page.getByText('Then, let the visual page wake when it approaches the viewport.')).toBeAttached();
  await expect(page.getByRole('status')).toContainText('The stable anchor and selected text agree');
});

test('a real repeated-text Selection creates a contextual, encoded fresh-load link', async ({ page }) => {
  await page.goto(RULEBOOK_TEXT_LINKS_PROTOTYPE_PATH);
  await selectElementText(page, 'repeated-second', 'The storm belongs to no one.');
  await page.getByRole('button', { name: 'Create link from selection' }).click();

  const shareUrl = await page.getByTestId('share-url').textContent();
  expect(shareUrl).toBeTruthy();
  expect(shareUrl).toContain('#storm-rule:~:text=');
  expect(shareUrl).toContain('After%20the%20shields');

  await page.goto(shareUrl!);
  await expect(page.locator('#storm-rule')).toHaveAttribute('data-locator-target', 'true');
  await expect(page.locator('#storm-rumour')).not.toHaveAttribute('data-locator-target', 'true');
});

test('hostile-looking selected text stays inert and unknown locators render fixed diagnostics', async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { prototypeAlertCalls: number }).prototypeAlertCalls = 0;
    window.alert = () => {
      (window as Window & { prototypeAlertCalls: number }).prototypeAlertCalls += 1;
    };
  });
  await page.goto(RULEBOOK_TEXT_LINKS_PROTOTYPE_PATH);
  await selectElementText(page, 'hostile-sample', '<script>alert("spice")</script>');
  await page.getByRole('button', { name: 'Create link from selection' }).click();

  const shareUrl = await page.getByTestId('share-url').textContent();
  expect(shareUrl).not.toContain('<script>');
  expect(shareUrl).not.toContain('"spice"');
  await expect(page.locator('[data-rulebook-prototype-document] script')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { prototypeAlertCalls: number }).prototypeAlertCalls)).toBe(0);

  await page.goto(`${RULEBOOK_TEXT_LINKS_PROTOTYPE_PATH}?loc=%25%25%25`);
  await expect(page.getByRole('alert')).toContainText('The link locator is malformed or too large.');
  await expect(page.getByRole('alert')).not.toContainText('%%%');
});

test('stale text and simulated unsupported browsers use the stable application fallback', async ({ page }) => {
  const staleLocator = { ...repeatedLocator, exact: 'This wording has been removed.' };
  await page.goto(buildRulebookTextShareUrl(baseUrl, staleLocator, 'compatibility'));

  await expect(page.getByRole('status')).toContainText('The stable anchor still resolves');
  await expect(page.getByText('Active scroll owner:').locator('..')).toContainText('application fallback');
  await expect(page.locator('#storm-rule')).toHaveAttribute('data-locator-target', 'true');
  await expect(page.locator('#storm-rule')).toBeInViewport();
});

test('the editor opens the located Page and uses the same locator', async ({ page }) => {
  await page.goto(buildRulebookTextShareUrl(baseUrl, repeatedLocator, 'editor'));

  await expect(page.locator('[data-rulebook-page-anchor]')).toHaveCount(1);
  await expect(page.locator('#page-storm')).toBeVisible();
  await expect(page.locator('#storm-rule')).toHaveAttribute('data-locator-target', 'true');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(page.locator('#page-aftermath')).toBeVisible();
});
