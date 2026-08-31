import { expect, test } from './coverage';
import { seedRulebookEditor } from './rulebook-fixture';

test.use({
  storageState: '.playwright/user-a-rulebook-lifecycle.json',
  viewport: { width: 1280, height: 900 },
  colorScheme: 'dark',
});
test.afterEach(async ({ context }) => {
  await context.storageState({ path: '.playwright/user-a-rulebook-lifecycle.json' });
});

test('members create clean Rulebooks and owners manage the saved Ruleset list', async ({
  page,
  newUserPage,
}, testInfo) => {
  const fixture = await seedRulebookEditor();
  const rulesetPath = `/rulesets/${fixture.rulesetSlug}`;
  await page.goto(`${fixture.path}#RULE/details`);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Saved source title');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Unsaved source title');

  const member = await newUserPage({ storageState: '.playwright/user-b-rulebook-lifecycle.json' });
  try {
    const other = member.page;
    await other.goto(rulesetPath);
    await expect(other.getByRole('list', { name: 'Rulebooks' })).toBeVisible();
    await expect(other.getByRole('button', { name: 'Rename Starter', exact: true })).toHaveCount(0);
    await expect(other.getByRole('button', { name: 'Delete Starter', exact: true })).toHaveCount(0);
    await other.getByRole('link', { name: 'Create Rulebook' }).click();
    await other.getByRole('textbox', { name: 'Rulebook name' }).fill('Member copy');
    await other.getByRole('radio', { name: 'Saved Rulebook' }).check();
    await other.getByRole('combobox', { name: 'Rulebook to copy' }).click();
    await other.getByRole('option', { name: 'Starter', exact: true }).click();
    await other.getByRole('button', { name: 'Create Rulebook', exact: true }).click();
    await expect(other).toHaveURL(/\/rulebooks\/member-copy\/edit/);
    await expect(other.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Saved source title');
    await expect(other.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(other.getByText('Revision 1', { exact: true })).toBeVisible();
    await other.reload();
    await expect(other.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Saved source title');
    await other.goto(rulesetPath);
    await other.getByRole('button', { name: 'Move Member copy up', exact: true }).click();
    await expect(other.getByRole('list', { name: 'Rulebooks' }).getByRole('listitem').first()).toContainText(
      'Member copy'
    );
    await other.reload();
    await expect(other.getByRole('list', { name: 'Rulebooks' }).getByRole('listitem').first()).toContainText(
      'Member copy'
    );
  } finally {
    await member.page.context().storageState({ path: '.playwright/user-b-rulebook-lifecycle.json' });
    await member.close();
  }

  await page.goto(rulesetPath);
  const list = page.getByRole('list', { name: 'Rulebooks' });
  await expect(list.getByRole('listitem').first()).toContainText('Member copy');
  await page.screenshot({ path: testInfo.outputPath('ruleset-rulebooks.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: 'Create Rulebook' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('ruleset-rulebooks-narrow.png'), fullPage: true });
  await page.getByRole('button', { name: 'Rename Member copy', exact: true }).click();
  await page.getByRole('textbox', { name: 'Rulebook name' }).fill('Battle reference');
  await expect(page.getByText(/bookmarks or shared links to the old one stop/)).toBeVisible();
  await page.getByRole('button', { name: 'Rename Rulebook', exact: true }).click();
  await expect(list.getByRole('link', { name: 'Edit' }).first()).toHaveAttribute(
    'href',
    `${rulesetPath}/rulebooks/battle-reference/edit`
  );
  await page.getByRole('button', { name: 'Delete Battle reference', exact: true }).focus();
  await page.keyboard.down('Space');
  await expect(list.getByText('Battle reference', { exact: true })).toHaveCount(0);
  await page.keyboard.up('Space');
  await page.reload();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('link', { name: 'Create Rulebook' }).click();
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
