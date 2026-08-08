import { expect, test } from './coverage';

test.use({ storageState: '.playwright/user-a-ruleset.json' });

test('owner can create and delete a ruleset in a two-user flow', async ({ page, browser }) => {
  const uniqueSuffix = Date.now();
  const uniqueName = `E2ERuleset${uniqueSuffix}`;
  const expectedSlug = uniqueName.toLowerCase();
  await page.goto('/rulesets/create');
  await page.getByRole('textbox', { name: 'Name' }).fill(uniqueName);
  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/rulesets/${expectedSlug}$`));

  const createdUrl = page.url();
  await expect(page.getByLabel('Edit ruleset')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(uniqueName).first()).toBeVisible({ timeout: 30_000 });

  const userBContext = await browser.newContext({ storageState: '.playwright/user-b.json' });
  const userBPage = await userBContext.newPage();
  await userBPage.goto(createdUrl);
  await expect(userBPage.getByText(uniqueName).first()).toBeVisible({ timeout: 30_000 });
  await expect(userBPage.getByLabel('Edit ruleset')).toHaveCount(0);
  await userBContext.close();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Delete ruleset').click();
  await expect(page).toHaveURL(/\/rulesets\/?$/);
  await expect(page.getByRole('link', { name: uniqueName })).toHaveCount(0);
});
