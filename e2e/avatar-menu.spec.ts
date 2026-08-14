import { expect, test } from './coverage';

/* Own storage state because the last step signs out, which would invalidate a shared session. */
test.use({ storageState: '.playwright/user-a-avatar-menu.json' });

/**
 * The signed-in account slot: the avatar opens a menu whose items lead to the user's own profile
 * routes, and Sign out returns the slot to Login. This is the one navigation state Storybook cannot
 * reach — its Convex mocks are signed-out by design — so the contract lives here.
 */
test('the avatar menu offers the profile routes and signs out', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  const avatar = nav.getByRole('button');
  await expect(avatar).toBeVisible();

  await avatar.click();
  await expect(page.getByRole('link', { name: 'Edit profile' })).toBeVisible();
  await page.getByRole('link', { name: 'Your profile' }).click();
  await expect(page).toHaveURL(/\/profiles\/[^/]+\/?$/);
  await expect(page.getByRole('link', { name: 'Your profile' })).not.toBeVisible();

  await avatar.click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(nav.getByRole('link', { name: 'Login' })).toBeVisible();
});
