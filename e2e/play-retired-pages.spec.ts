import { expect, test } from './coverage';

/*
 * The Demo and Hosted pages were retired in #1296, and the game route would otherwise read their names as game ids.
 * Old links land in the lobby, while any other unknown address still says there is no game to open.
 */
test('the retired Demo and Hosted addresses redirect to the lobby', async ({ page }) => {
  for (const retired of ['/play/demo', '/play/hosted']) {
    await page.goto(retired);
    await expect(page).toHaveURL(/\/play$/u);
    await expect(page.getByRole('heading', { name: 'Game lobby' })).toBeVisible();
  }
  await page.goto('/play/no-such-game');
  await expect(page.getByText('This game is not available', { exact: true })).toBeVisible();
});
