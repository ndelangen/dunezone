import { expect, test } from './coverage';

/* Signed out on purpose: the journey starts on a page that asks the reader to log in. */
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * A reader who signs in from a page other than the homepage lands back on that page.
 * The local password form stands in for Google and Discord here;
 * all three hand the sign-in page the same `redirect`.
 */
test('signing in returns to the page the reader came from', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_USER_A_EMAIL;
  const password = process.env.PLAYWRIGHT_USER_PASSWORD;
  if (!email || !password) {
    throw new Error('PLAYWRIGHT_USER_A_EMAIL and PLAYWRIGHT_USER_PASSWORD are required');
  }

  await page.goto('/factions/create');
  await page.getByRole('link', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Ffactions%2Fcreate$/);

  await page.getByRole('textbox', { name: /email/i }).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByTestId('local-auth-submit').click();

  await expect(page).toHaveURL(/\/factions\/create\/?$/);
  await expect(page.getByRole('link', { name: 'Log in' })).toHaveCount(0);
});
