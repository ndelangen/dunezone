import { expect, test } from './coverage';

/* Own storage state because the last step signs out, which would invalidate a shared session. */
test.use({ storageState: '.playwright/user-a-avatar-menu.json' });

/**
 * The signed-in account slot: the avatar opens a menu whose items lead to the user's own profile routes, and Sign out returns the slot to Login.
 * This is the one navigation state Storybook cannot reach — its Convex mocks are signed-out by design — so the contract lives here.
 */
test('the avatar menu offers the profile routes and signs out', async ({ page }) => {
  /* The seed derives username and slug from the email's local part (convex/e2e.ts). */
  const username = (process.env.PLAYWRIGHT_USER_A_EMAIL ?? 'e2e-user-a@example.com').split('@')[0];

  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  const avatar = nav.getByRole('button', { name: username });
  await expect(avatar).toBeVisible();

  /*
    The dropdown is portalled, so it is addressed by its own `menu` role rather than through the nav. Role and
    accessible name are the whole contract here: an item's markup is the menu's business, and asserting that one
    happens to be an anchor and another a button is what made this test break on a change it should not have noticed.
  */
  const menu = page.getByRole('menu');
  const choose = async (name: string) => {
    await avatar.click();
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name }).click();
  };

  /* Each route item is followed rather than read off an `href`: arriving is the promise, the attribute is one way of keeping it. */
  await choose('Edit profile');
  await expect(page).toHaveURL(new RegExp(`/profiles/${username}/edit/?$`));

  await choose('Your profile');
  await expect(page).toHaveURL(new RegExp(`/profiles/${username}/?$`));
  /* Picking an item dismisses the menu — Mantine's job, but the nav leans on it, since no item closes it by hand. */
  await expect(menu).not.toBeVisible();

  await choose('Sign out');
  await expect(nav.getByRole('link', { name: 'Login' })).toBeVisible();
});
