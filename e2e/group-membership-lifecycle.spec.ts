import { expect, longSpecTimeoutMs, test } from './coverage';

test.use({ storageState: '.playwright/user-a-group.json' });

test('membership lifecycle: request, approve, moderate, remove', async ({ page, newUserPage }) => {
  test.setTimeout(longSpecTimeoutMs);

  const suffix = Date.now();
  const groupName = `E2EMembership${suffix}`;

  await test.step('owner creates the Group', async () => {
    await page.goto('/groups/create');
    await page.getByRole('textbox', { name: 'Group name' }).fill(groupName);
    await page.getByRole('button', { name: 'Save group' }).click();
    await expect(page).toHaveURL(/\/profiles\//);
    await page.goto(`/groups/${groupName.toLowerCase()}`);
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible();
  });
  const groupUrl = page.url();

  const userB = await newUserPage({ storageState: '.playwright/user-b-group.json' });
  const userBPage = userB.page;

  await test.step('visitor requests membership', async () => {
    await userBPage.goto(groupUrl);
    await expect(userBPage.getByText('Not a member')).toBeVisible();
    await userBPage.getByRole('button', { name: 'Request membership' }).click();
    await expect(userBPage.getByText('Pending approval')).toBeVisible();
  });

  await test.step('owner approves from the roster', async () => {
    await page.goto(groupUrl);
    await expect(page.getByText('(pending)')).toBeVisible();
    await page.getByRole('button', { name: 'Approve membership' }).click();
    await expect(page.getByText('(pending)')).not.toBeVisible();
  });

  await test.step('member sees active status through the live subscription', async () => {
    await expect(userBPage.getByText('Active member')).toBeVisible();
    await expect(userBPage.getByRole('button', { name: 'Request membership' })).not.toBeVisible();
  });

  await test.step('owner removes the member', async () => {
    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Remove member' }).click();
    await expect(page.getByRole('button', { name: 'Remove member' })).not.toBeVisible();
  });

  await test.step('removed member loses membership and may request again', async () => {
    await expect(userBPage.getByText('Not a member')).toBeVisible();
    await expect(userBPage.getByRole('button', { name: 'Request membership' })).toBeVisible();
  });

  await userB.close();
});
