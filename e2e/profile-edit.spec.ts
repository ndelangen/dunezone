import { userA } from './accounts';
import { expect, test } from './coverage';

test.use({ storageState: '.playwright/user-a-profile-edit.json' });

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

test('profile editing connects settings, previews avatars, and persists appearance choices', async ({ page }) => {
  await page.route('https://avatar.example/ready.png', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: onePixelPng });
  });
  await page.route('https://avatar.example/unavailable.png', async (route) => {
    await route.fulfill({ status: 404, body: 'missing' });
  });

  await page.goto('/profiles/' + userA.slug + '/edit');
  const save = page.getByRole('button', { name: 'Save profile' });
  await expect(save).toBeDisabled();
  await expect(save.locator('svg')).toBeVisible();

  const displayNameHelp = page.getByRole('group', { name: 'Display name *' }).getByRole('img', { name: 'Help' });
  await displayNameHelp.hover();
  await expect(page.getByRole('tooltip')).toContainText('Letters and numbers only');

  /*
   * Two real responses, which is the whole of what this journey adds over the component test beside it.
   * `-edit.test.tsx` drives the same five states through fireEvent.load and fireEvent.error, so which
   * message belongs to which state is covered there; what it cannot cover is a browser delivering a real
   * 200 and a real 404 to the preview's own handlers. The empty, invalid and loading assertions are gone
   * from here for that reason: not one of them involves a response.
   */
  const avatarUrl = page.getByRole('textbox', { name: 'Avatar image URL' });
  await avatarUrl.fill('https://avatar.example/ready.png');
  await expect(page.getByRole('img', { name: new RegExp('Avatar preview for ' + userA.username, 'i') })).toBeVisible();

  await avatarUrl.fill('https://avatar.example/unavailable.png');
  await expect(page.getByRole('alert')).toContainText('This image could not be loaded.');

  await page.getByRole('tab', { name: 'Creation defaults' }).click();
  await expect(page.getByRole('combobox', { name: 'Default Group' })).toBeVisible();
  const defaultGroupHelp = page.getByRole('group', { name: 'Default Group' }).getByRole('img', { name: 'Help' });
  await defaultGroupHelp.hover();
  await expect(page.getByRole('tooltip')).toContainText('New rulesets and factions use this Group');

  await page.getByRole('tab', { name: 'Account' }).click();
  await expect(page.getByRole('link', { name: 'Delete account' })).toBeVisible();

  await page.getByRole('tab', { name: 'Appearance' }).click();
  const motionHelp = page.getByRole('group', { name: 'Ambient motion' }).getByRole('img', { name: 'Help' });
  await motionHelp.hover();
  await expect(page.getByRole('tooltip')).toContainText('The masthead video and the turning dice');
  await page.getByText('Dark', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dunezone-color-scheme'))).toBe('dark');
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');

  await page.getByText('Off', { exact: true }).click();
  await expect
    .poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === 'motion')?.value)
    .toBe('off');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');

  await page.reload();
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Off' })).toBeChecked();

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const systemOptions = page.getByText('System', { exact: true });
  await systemOptions.first().click();
  await systemOptions.last().click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dunezone-color-scheme'))).toBeNull();
  await expect
    .poll(async () => (await page.context().cookies()).some((cookie) => cookie.name === 'motion'))
    .toBe(false);
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');

  await page.reload();
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await expect(page.getByRole('radio', { name: 'System', exact: true }).first()).toBeChecked();
  await expect(page.getByRole('radio', { name: 'System', exact: true }).last()).toBeChecked();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Next section' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeVisible();
});
