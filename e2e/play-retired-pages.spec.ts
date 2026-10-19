import { expect, test } from './coverage';

/*
 * Its own session, because the project default is shared: a spec that ran on it before this one, in the same shard,
 * spent its rotating refresh token, and this file then arrived signed out, where an unknown game asks for a login
 * instead of saying there is none. Only the shard split kept that apart in CI; one full local run failed on it.
 */
test.use({ storageState: '.playwright/user-a-play.json' });

/*
 * The Demo and Hosted pages were retired in #1296, and the game route would otherwise read their names as game ids.
 * Old links land in the lobby, while any other unknown address still says there is no game to open.
 */
test('the retired Demo and Hosted addresses redirect to the lobby', async ({ page }) => {
  for (const retired of ['/play/demo', '/play/hosted']) {
    await page.goto(retired);
    await expect(page).toHaveURL(/\/play$/u);
    await expect(page.getByRole('heading', { name: 'Play Dune!' })).toBeVisible();
  }
  await page.goto('/play/no-such-game');
  await expect(page.getByText('This game is not available', { exact: true })).toBeVisible();
});
