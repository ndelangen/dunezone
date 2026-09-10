import type { Page } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';

import { api } from '../convex/_generated/api';
import { publishingTreacheryCard } from '../src/shared/assets/fixtures/publishingTreacheryCard';
import { expect, longSpecTimeoutMs, test } from './coverage';
import { seedRulebookEditor } from './rulebook-fixture';

test.use({
  storageState: '.playwright/user-a-rulebook-lifecycle.json',
  viewport: { width: 1280, height: 900 },
  colorScheme: 'dark',
});
test.afterEach(async ({ context }) => {
  await context.storageState({ path: '.playwright/user-a-rulebook-lifecycle.json' });
});

async function copySavedRulebookAndMoveFirst(page: Page, rulesetPath: string) {
  await page.goto(rulesetPath);
  await expect(page.getByRole('list', { name: 'Rulebooks' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rename Starter', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete Starter', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Move .* up/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Add Rulebook' }).click();
  await page.getByRole('textbox', { name: 'Rulebook name' }).fill('Member copy');
  await page.getByRole('radio', { name: 'Saved Rulebook' }).check();
  await page.getByRole('combobox', { name: 'Rulebook to copy' }).click();
  await page.getByRole('option', { name: 'Starter', exact: true }).click();
  await page.getByRole('button', { name: 'Create Rulebook', exact: true }).click();
  await expect(page).toHaveURL(/\/rulebooks\/member-copy\/edit/);
  await page.getByRole('link', { name: 'Saved source title', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Saved source title');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.getByText('Revision 1', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Saved source title');
  await page.goto(`${rulesetPath}/edit`);
  await page.getByRole('button', { name: 'Move Member copy up', exact: true }).click();
  const firstRulebook = page.getByRole('list', { name: 'Rulebooks' }).getByRole('listitem').first();
  await expect(firstRulebook).toContainText('Member copy');
  await page.reload();
  await expect(firstRulebook).toContainText('Member copy');
}

test('members create clean Rulebooks and owners manage the saved Ruleset list', async ({
  page,
  newUserPage,
}, testInfo) => {
  test.setTimeout(longSpecTimeoutMs);
  const fixture = await seedRulebookEditor();
  const rulesetPath = `/rulesets/${fixture.rulesetSlug}`;
  await page.goto(`${fixture.path}#RULE/details`);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Saved source title');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Unsaved source title');

  const member = await newUserPage({ storageState: '.playwright/user-b-rulebook-lifecycle.json' });
  try {
    await test.step('a member clones saved Contents and saves list order', () =>
      copySavedRulebookAndMoveFirst(member.page, rulesetPath));
  } finally {
    await member.page.context().storageState({ path: '.playwright/user-b-rulebook-lifecycle.json' });
    await member.close();
  }

  await page.goto(rulesetPath);
  const list = page.getByRole('list', { name: 'Rulebooks' });
  await expect(list.getByRole('listitem').first()).toContainText('Member copy');
  await page.screenshot({ path: testInfo.outputPath('ruleset-rulebooks.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: 'Add Rulebook' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('ruleset-rulebooks-narrow.png'), fullPage: true });
  await page.getByRole('link', { name: 'Read Member copy', exact: true }).click();
  await expect(page).toHaveURL(/\/rulebooks\/member-copy\/?$/);
  await expect(page.getByRole('region', { name: 'Member copy contents' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Rulebook page: Saved source title' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to ruleset', exact: true }).click();
  await page.getByRole('button', { name: 'Actions for Member copy', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Rename Rulebook', exact: true }).click();
  await page.getByRole('textbox', { name: 'Rulebook name' }).fill('Battle reference');
  await expect(page.getByText(/bookmarks or shared links to the old one stop/)).toBeVisible();
  const renameForm = page.getByRole('form', { name: 'Rename Rulebook' });
  await renameForm.getByRole('button', { name: 'Rename Rulebook', exact: true }).click();
  await expect(page).toHaveURL(/\/rulebooks\/battle-reference\/edit/);
  await page.goto(`${rulesetPath}/edit`);
  await expect(list.getByRole('link', { name: 'Edit Battle reference' })).toHaveAttribute(
    'href',
    `${rulesetPath}/rulebooks/battle-reference/edit`
  );
  await page.getByRole('button', { name: 'Delete Battle reference', exact: true }).focus();
  await page.keyboard.down('Space');
  await expect(list.getByText('Battle reference', { exact: true })).toHaveCount(0);
  await page.keyboard.up('Space');
  await page.reload();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await page.goto(rulesetPath);
  await page.getByRole('link', { name: 'Add Rulebook' }).click();
  await page.getByRole('radio', { name: 'Saved Rulebook' }).check();
  await page.getByRole('combobox', { name: 'Rulebook to copy' }).click();
  await expect(page.getByRole('option', { name: 'Starter', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Battle reference', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: 'Starter template' }).check();
  await page.getByRole('textbox', { name: 'Rulebook name' }).fill('Battle reference');
  await page.getByRole('button', { name: 'Create Rulebook', exact: true }).click();
  await expect(page).toHaveURL(/\/rulebooks\/battle-reference-2\/edit/);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

async function createGuideCards() {
  const client = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL ?? 'http://127.0.0.1:3210');
  const session = await client.action(api.auth.signIn, {
    provider: 'password',
    params: {
      flow: 'signIn',
      email: process.env.PLAYWRIGHT_USER_A_EMAIL!,
      password: process.env.PLAYWRIGHT_USER_PASSWORD!,
    },
  });
  if (!session.tokens) {
    throw new Error('Card guide fixtures need an authenticated author.');
  }
  client.setAuth(session.tokens.token);
  const suffix = crypto.randomUUID().slice(0, 8);
  const names = [`Guide Lasgun ${suffix}`, `Guide Shield ${suffix}`];
  for (const name of names) {
    await client.mutation(api.assets.create, {
      type: 'card-treachery',
      data: { ...publishingTreacheryCard, name },
    });
  }
  return names;
}

async function chooseGuideCard(page: Page, name: string) {
  await page.getByRole('button', { name: 'Choose Card', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find Card', exact: true }).fill(name);
  await page.getByRole('option', { name: new RegExp(name) }).click();
  await expect(page.getByRole('searchbox', { name: 'Find Card', exact: true })).toHaveCount(0);
}

async function authorCardGuides(page: Page, cardNames: string[]) {
  const structure = page.getByRole('complementary', { name: 'Rulebook structure' });
  await structure.getByRole('button', { name: 'Add Page', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Single column', exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Treachery cards');
  await structure.getByRole('button', { name: 'Add Block', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Card entry', exact: true }).click();
  await chooseGuideCard(page, cardNames[0]!);
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('1');
  await page.getByRole('textbox', { name: 'Guidance', exact: true }).fill('Explain this Card before the first battle.');
  await structure.getByRole('button', { name: 'Add Block', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Card group', exact: true }).click();
  await page.getByRole('textbox', { name: 'Heading', exact: true }).fill('Lasgun and Shield');
  await page.getByRole('textbox', { name: 'Shared guidance', exact: true }).fill('Explain their interaction together.');
  for (const [index, name] of cardNames.entries()) {
    await page.getByRole('button', { name: 'Add Card', exact: true }).click();
    await chooseGuideCard(page, name);
    await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill(String(index + 1));
    await page.getByRole('textbox', { name: 'Guidance', exact: true }).fill(`Guidance for ${name}.`);
  }
  await page.getByRole('combobox', { name: 'Treatment', exact: true }).click();
  await page.getByRole('option', { name: 'Featured Card', exact: true }).click();
  await page.getByRole('combobox', { name: 'Featured Card', exact: true }).click();
  await page.getByRole('option', { name: `2. ${cardNames[1]}`, exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Heading', exact: true })).toHaveValue('Lasgun and Shield');
  await expect(page.getByRole('combobox', { name: 'Featured Card', exact: true })).toHaveValue(`2. ${cardNames[1]}`);
}

async function authorAssetExplainer(page: Page) {
  const structure = page.getByRole('complementary', { name: 'Rulebook structure' });
  await structure.getByRole('button', { name: 'Add Page', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Single column', exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Strongholds');
  await structure.getByRole('button', { name: 'Add Block', exact: true }).click();
  await page.getByRole('menuitem', { name: 'AssetExplainer', exact: true }).click();
  await page.getByRole('button', { name: 'Choose source', exact: true }).click();
  await page.getByRole('combobox', { name: 'Source type', exact: true }).click();
  await page.getByRole('option', { name: 'Board', exact: true }).click();
  await page.getByRole('combobox', { name: 'Board', exact: true }).click();
  await page.getByRole('option', { name: 'Arrakis board', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Caption', exact: true })
    .fill('The surrounding territories stay visible for context.');
  await page.getByRole('button', { name: 'Add explanation', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Marker label', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Territory or region', exact: true }).click();
  await page.getByRole('option', { name: 'Arrakeen', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Explanation', exact: true })
    .fill('Arrakeen provides access to ornithopters.');
  await page.getByRole('combobox', { name: 'Marker labels', exact: true }).click();
  await page.getByRole('option', { name: 'Custom labels', exact: true }).click();
  await page.getByRole('textbox', { name: 'Marker label', exact: true }).fill('A');
  await page.getByRole('switch', { name: 'Automatic colors', exact: true }).uncheck();
  await page.getByRole('textbox', { name: 'Marker color', exact: true }).fill('#244d7c');
  await page.getByRole('button', { name: 'Add explanation', exact: true }).click();
  await page.getByRole('textbox', { name: 'Marker label', exact: true }).fill('B');
  await page.getByRole('combobox', { name: 'Target type', exact: true }).click();
  await page.getByRole('option', { name: 'Positioned marker', exact: true }).click();
  await page.getByRole('textbox', { name: 'Horizontal position', exact: true }).fill('70');
  await page.getByRole('textbox', { name: 'Vertical position', exact: true }).fill('30');
  await page.getByRole('textbox', { name: 'Explanation', exact: true }).fill('A positioned reminder on the board.');
  const handle = await page.getByRole('button', { name: 'Reorder explanation 2', exact: true }).boundingBox();
  const firstEntry = await page.getByRole('button', { name: 'A. Arrakeen', exact: true }).boundingBox();
  expect(handle).not.toBeNull();
  expect(firstEntry).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2, firstEntry!.y + firstEntry!.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
  await page.reload();
  const explainer = page.locator('[data-rulebook-explainer]');
  await expect(explainer.locator('li').first()).toContainText('A positioned reminder on the board.');
  await expect(page.getByRole('textbox', { name: 'Marker label', exact: true })).toHaveValue('B');
  await expect(page.getByRole('textbox', { name: 'Horizontal position', exact: true })).toHaveValue('70%');
  await page.getByRole('button', { name: 'A. Arrakeen', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Marker color', exact: true })).toHaveValue('#244d7c');
  await page.getByRole('switch', { name: 'Automatic colors', exact: true }).check();
  await expect(page.getByRole('textbox', { name: 'Marker color', exact: true })).toHaveCount(0);
  await page.getByRole('switch', { name: 'Automatic colors', exact: true }).uncheck();
  await expect(page.getByRole('textbox', { name: 'Marker color', exact: true })).toHaveValue('#244d7c');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
}

test('a final-catalogue Rulebook saves fixed Pages and publishes written rules, Card guides and annotated assets', async ({
  page,
}) => {
  test.setTimeout(longSpecTimeoutMs);
  const fixture = await seedRulebookEditor();
  const rulesetPath = `/rulesets/${fixture.rulesetSlug}`;
  const cardNames = await createGuideCards();
  await page.goto(`${rulesetPath}/rulebooks/create`);
  await page.getByRole('textbox', { name: 'Rulebook name' }).fill('Field guide');
  await page.getByRole('button', { name: 'Create Rulebook', exact: true }).click();
  await expect(page).toHaveURL(/\/field-guide\/edit#RULE\/details$/);
  const structure = page.getByRole('complementary', { name: 'Rulebook structure' });
  const initialPage = page.getByRole('article', { name: 'Rulebook page: Introduction' });
  await expect(initialPage).toHaveAttribute('data-rulebook-layout', 'single-column');
  await expect(initialPage).toHaveAttribute('data-rulebook-size', 'a4');
  await expect(initialPage).toHaveAttribute('data-rulebook-design', 'illustrated');

  await page.goto(`${rulesetPath}/rulebooks/field-guide/edit#RULE/L5ST`);
  await page.getByRole('textbox', { name: 'Item 1 name', exact: true }).fill('Choose your forces');
  await page.getByRole('textbox', { name: 'Item 1', exact: true }).fill('Move the selected group together.');
  await expect(initialPage.locator('ol')).toContainText('Choose your forces');

  await structure.getByRole('button', { name: 'Add Page', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Narrow left / wide right', exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Battle sequence');
  const pageAnchor = await page.getByRole('textbox', { name: 'Anchor', exact: true }).inputValue();
  const battlePage = page.getByRole('article', { name: 'Rulebook page: Battle sequence' });
  await expect(battlePage).toHaveAttribute('data-rulebook-layout', 'wide-narrow');
  await page.getByRole('switch', { name: 'Show page heading', exact: true }).uncheck();
  await expect(battlePage.getByRole('heading', { level: 1 })).toHaveCount(0);
  await structure.getByRole('button', { name: 'Add Block', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Question and answer', exact: true }).click();
  await page.getByRole('textbox', { name: 'Question', exact: true }).fill('When are losses removed?');
  await page.getByRole('textbox', { name: 'Answer', exact: true }).fill('After the battle is resolved.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
  await page.reload();
  await expect(battlePage).toHaveAttribute('data-rulebook-layout', 'wide-narrow');
  await expect(battlePage).toContainText('After the battle is resolved.');
  await authorCardGuides(page, cardNames);
  await authorAssetExplainer(page);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Publish Edition 2?' })
    .getByRole('button', { name: 'Publish Edition 2', exact: true })
    .click();
  await expect(page.getByText('The new Edition is now current.')).toBeVisible();
  await page.goto(`${rulesetPath}/rulebooks/field-guide#${pageAnchor}`);
  await expect(battlePage).toContainText('When are losses removed?');
  await expect(battlePage.getByRole('heading', { level: 1 })).toHaveCount(0);
  await expect(page.locator('[data-rulebook-page-number="1"] ol')).toContainText('Choose your forces');
  const cardPage = page.getByRole('article', { name: 'Rulebook page: Treachery cards' });
  await expect(cardPage.getByRole('heading', { name: 'Lasgun and Shield', exact: true })).toBeVisible();
  await expect(cardPage).toContainText('Explain this Card before the first battle.');
  await expect(cardPage).toContainText('Explain their interaction together.');
  for (const name of cardNames) {
    await expect(cardPage).toContainText(`Guidance for ${name}.`);
  }
  await expect(cardPage.locator('[data-card-group-variant="featured-member"]')).toBeVisible();
  const strongholdsPage = page.getByRole('article', { name: 'Rulebook page: Strongholds' });
  await expect(strongholdsPage).toContainText('Arrakeen provides access to ornithopters.');
  await expect(strongholdsPage.locator('[data-rulebook-explainer] li')).toHaveCount(2);
});
