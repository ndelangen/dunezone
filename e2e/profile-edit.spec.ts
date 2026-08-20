import { userA } from './accounts';
import { expect, test } from './coverage';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

test('profile editing connects settings, previews avatars, and persists appearance choices', async ({ page }) => {
  let releaseAvatar: (() => void) | undefined;
  const avatarRequested = new Promise<void>((resolve) => {
    releaseAvatar = resolve;
  });

  await page.route('https://avatar.example/ready.png', async (route) => {
    await avatarRequested;
    await route.fulfill({ status: 200, contentType: 'image/png', body: onePixelPng });
  });
  await page.route('https://avatar.example/unavailable.png', async (route) => {
    await route.fulfill({ status: 404, body: 'missing' });
  });

  await page.goto('/profiles/' + userA.slug + '/edit');
  const save = page.getByRole('button', { name: 'Save profile' });
  await expect(save).toBeDisabled();

  const avatarUrl = page.getByLabel('Avatar image URL');
  await avatarUrl.fill('');
  await expect(page.getByRole('status')).toContainText('Enter an avatar URL to see a preview.');

  await avatarUrl.fill('not a URL');
  await expect(page.getByRole('alert')).toContainText('Enter a valid https:// image URL.');

  await avatarUrl.fill('https://avatar.example/ready.png');
  await expect(page.getByRole('status')).toContainText('Loading avatar preview...');
  releaseAvatar?.();
  await expect(page.getByRole('img', { name: new RegExp('Avatar preview for ' + userA.username, 'i') })).toBeVisible();

  await avatarUrl.fill('https://avatar.example/unavailable.png');
  await expect(page.getByRole('alert')).toContainText('This image could not be loaded.');

  await avatarUrl.fill('https://avatar.example/ready.png');
  await expect(page.getByRole('img', { name: new RegExp('Avatar preview for ' + userA.username, 'i') })).toBeVisible();

  await page.getByRole('tab', { name: 'Creation defaults' }).click();
  await expect(page.getByRole('combobox', { name: 'Default Group' })).toBeVisible();

  await page.getByRole('tab', { name: 'Appearance' }).click();
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
