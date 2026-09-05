import { expect, test } from './coverage';

test.use({ storageState: '.playwright/user-a-ruleset.json' });

test('owner can create and delete a ruleset in a two-user flow', async ({ page, newUserPage }) => {
  await page.goto('/rulesets/e2ebaselineruleset');
  await expect(page.getByRole('heading', { name: 'About this ruleset' })).toBeVisible();
  await expect(page.getByText('Nothing written about this yet.')).toBeVisible();

  const uniqueSuffix = Date.now();
  const uniqueName = `E2ERuleset${uniqueSuffix}`;
  const expectedSlug = uniqueName.toLowerCase();
  await page.goto('/rulesets/create');
  /*
   * The form has to be proven present before its missing control means anything.
   * The app is served as an SPA, so the document that arrives is an empty shell: a zero count is satisfied
   * before React has rendered anything at all, and the assertion passes whether or not the combobox exists.
   */
  const nameField = page.getByRole('textbox', { name: 'Name' });
  await expect(nameField).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Group' })).toHaveCount(0);
  await nameField.fill(uniqueName);
  /* Creation requires an About of at least 50 characters, with no exemption; the toolbar's save creates nothing without one. */
  await page
    .getByRole('textbox', { name: 'About' })
    .fill('A lifecycle ruleset proving that creation and deletion behave for its owner.');
  await page.getByRole('button', { name: /^create ruleset$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/rulesets/${expectedSlug}$`));

  const createdUrl = page.url();
  await expect(page.getByLabel('Edit ruleset')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(uniqueName).first()).toBeVisible({ timeout: 30_000 });
  await page.goto(`${createdUrl}?notice=default-group-unavailable`);
  await expect(page.getByRole('alert')).toContainText('Saved without its default Group');
  await page.goto(`${createdUrl}?notice=not-a-route-notice`);
  /* Same anchoring: the page has to have rendered before "no alert" is a statement about the notice. */
  await expect(page.getByText(uniqueName).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);

  const userB = await newUserPage({ storageState: '.playwright/user-b.json' });
  const userBPage = userB.page;
  await userBPage.goto(createdUrl);
  await expect(userBPage.getByText(uniqueName).first()).toBeVisible({ timeout: 30_000 });
  await expect(userBPage.getByLabel('Edit ruleset')).toHaveCount(0);
  await userB.close();

  /* Deletes are held, not asked twice: five seconds of press, with a beat of margin for timer skew. */
  await page.getByLabel('Delete ruleset').hover();
  await page.mouse.down();
  await page.waitForTimeout(5200);
  await page.mouse.up();
  await expect(page).toHaveURL(/\/rulesets\/?$/);
  /*
   * Precautionary rather than a repair: unlike the two above, this absence was measured biting on its own,
   * because the delete navigates client side and the index has painted by the time the URL settles.
   * The anchor costs one assertion and removes the dependence on that timing holding on a slower runner.
   */
  await expect(page.getByRole('heading', { name: 'Rulesets' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: uniqueName })).toHaveCount(0);
});
