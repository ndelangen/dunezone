import { accountDeleteUser, userA } from './accounts';
import { expect, test } from './coverage';

test.use({ storageState: '.playwright/account-delete.json' });

test('a disposable account reviews ownership and completes deletion', async ({ page }) => {
  await page.goto('/profiles/' + accountDeleteUser.slug + '/edit');
  await page.getByRole('tab', { name: 'Account' }).click();
  await page.getByRole('link', { name: 'Delete account' }).click();

  await expect(page.getByRole('heading', { name: 'Delete account', level: 1 })).toBeVisible();
  await expect(page.getByText('This account directly owns no Groups, factions, or rulesets.')).toBeVisible();

  await page.getByRole('button', { name: 'Choose a replacement owner' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search profiles' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search profiles' }).fill(userA.username);
  await expect(page.getByRole('option', { name: userA.username })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('checkbox').check();
  /* Deletes are held, not clicked: five seconds of press, with a beat of margin for timer skew. */
  await page.getByRole('button', { name: 'Delete account' }).hover();
  await page.mouse.down();
  await page.waitForTimeout(5200);
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: 'Account deleted' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to Dune Zone' })).toBeVisible();
});
