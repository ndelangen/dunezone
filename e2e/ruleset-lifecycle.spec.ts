import { expect, test } from './coverage';

test.use({ storageState: '.playwright/user-a-ruleset.json' });

test('owner can create and delete a ruleset in a two-user flow', async ({ page, newUserPage }) => {
  const uniqueSuffix = Date.now();
  const uniqueName = `E2ERuleset${uniqueSuffix}`;
  const expectedSlug = uniqueName.toLowerCase();
  await page.goto('/rulesets/create');
  await expect(page.getByRole('combobox', { name: 'Group' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Name' }).fill(uniqueName);
  /* Creation requires a description of at least 50 characters, with no exemption, so the button stays disabled without one. */
  await page
    .getByRole('textbox', { name: 'Description' })
    .fill('A lifecycle ruleset proving that creation and deletion behave for its owner.');
  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/rulesets/${expectedSlug}$`));

  const createdUrl = page.url();
  await expect(page.getByLabel('Edit ruleset')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(uniqueName).first()).toBeVisible({ timeout: 30_000 });
  await page.goto(`${createdUrl}?groupDefaultUnavailable=true`);
  await expect(page.getByRole('alert')).toContainText('Ruleset saved without its default Group');

  const userB = await newUserPage({ storageState: '.playwright/user-b.json' });
  const userBPage = userB.page;
  await userBPage.goto(createdUrl);
  await expect(userBPage.getByText(uniqueName).first()).toBeVisible({ timeout: 30_000 });
  await expect(userBPage.getByLabel('Edit ruleset')).toHaveCount(0);
  await userB.close();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Delete ruleset').click();
  await expect(page).toHaveURL(/\/rulesets\/?$/);
  await expect(page.getByRole('link', { name: uniqueName })).toHaveCount(0);
});
