import { expect, longSpecTimeoutMs, test } from './coverage';

test.use({ storageState: '.playwright/user-a-group.json' });

test('owner adds an owned, unassigned faction to their Group', async ({ page }) => {
  test.setTimeout(longSpecTimeoutMs);

  const suffix = Date.now();
  const groupName = `E2EAssetAssign${suffix}`;
  const factionName = `E2EAssetAssignFaction${suffix}`;

  await test.step('owner creates the Group', async () => {
    await page.goto('/groups/create');
    await page.getByRole('textbox', { name: 'Group name' }).fill(groupName);
    await page.getByRole('button', { name: 'Save group' }).click();
    await expect(page).toHaveURL(/\/profiles\//);
  });

  await test.step('owner creates an unassigned faction', async () => {
    await page.goto('/factions/create');
    await page.getByRole('textbox', { name: 'Faction name' }).fill(factionName);
    await page.getByRole('tab', { name: /^Faction leader/ }).click();
    await page.getByRole('textbox', { name: 'Faction leader name' }).fill('Leader');
    await page.getByRole('button', { name: 'Save faction' }).click();
    await expect(page).toHaveURL(new RegExp(`/factions/${factionName.toLowerCase()}/edit$`));
  });

  await test.step('owner adds the faction to the Group from the picker', async () => {
    await page.goto(`/groups/${groupName.toLowerCase()}`);
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible();
    await expect(page.getByText(factionName)).not.toBeVisible();

    await page.getByRole('button', { name: 'Add a faction you own' }).click();
    const search = page.getByRole('combobox', { name: 'Search your factions' });
    await search.fill(factionName);
    await page.getByRole('option').filter({ hasText: factionName }).click();
    await page.getByRole('button', { name: 'Add to this group' }).click();

    await expect(page.getByText(factionName)).toBeVisible();
  });
});
