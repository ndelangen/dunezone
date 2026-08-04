import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function createFaction(page: Page, name: string, factionLeaderName: string) {
  await page.goto('/factions/create');
  await page.getByRole('textbox', { name: 'Faction name' }).fill(name);
  await page.getByRole('tab', { name: /^Faction leader/ }).click();
  await page.getByRole('textbox', { name: 'Faction leader name' }).fill(factionLeaderName);
  await page.getByRole('button', { name: 'Save faction' }).click();
  await expect(page).toHaveURL(new RegExp(`/factions/${name.toLowerCase()}/edit$`));
  await expect(page.getByRole('heading', { name: `Edit ${name}` })).toBeVisible();
  return page.url();
}

async function loadFactionDraft(page: Page, factionName: string) {
  await page.getByRole('button', { name: 'Load existing faction' }).click();
  const search = page.getByRole('combobox', { name: 'Search factions' });
  await search.fill(factionName);
  await page.getByRole('option').filter({ hasText: factionName }).click();
  await page.getByRole('button', { name: 'Load faction' }).click();
}

test('owner can create and delete a ruleset in a two-user flow', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'userA',
    'This scenario orchestrates both users from the userA project.'
  );

  const uniqueSuffix = Date.now();
  const uniqueName = `E2ERuleset${uniqueSuffix}`;
  const expectedSlug = uniqueName.toLowerCase();
  await page.goto('/rulesets/create');
  await page.getByRole('textbox', { name: 'Name' }).fill(uniqueName);
  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/rulesets/${expectedSlug}$`));

  const createdUrl = page.url();
  await expect(page.getByLabel('Edit ruleset')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(uniqueName).first()).toBeVisible({ timeout: 30_000 });

  const userBContext = await browser.newContext({ storageState: '.playwright/user-b.json' });
  const userBPage = await userBContext.newPage();
  await userBPage.goto(createdUrl);
  await expect(userBPage.getByText(uniqueName).first()).toBeVisible({ timeout: 30_000 });
  await expect(userBPage.getByLabel('Edit ruleset')).toHaveCount(0);
  await userBContext.close();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Delete ruleset').click();
  await expect(page).toHaveURL(/\/rulesets\/?$/);
  await expect(page.getByRole('link', { name: uniqueName })).toHaveCount(0);
});

test('owner can author a faction through its complete lifecycle', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'userA', 'One signed-in browser covers this happy flow.');
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1200, height: 900 });

  const suffix = Date.now();
  const factionAName = `E2EAuthoringA${suffix}`;
  const factionBName = `E2EAuthoringB${suffix}`;
  const factionALeaderName = `Leader A ${suffix}`;
  const importedLeaderName = `Imported Leader ${suffix}`;
  let factionAEditUrl = '';
  let factionBEditUrl = '';

  await test.step('create A from an existing B draft', async () => {
    factionBEditUrl = await createFaction(page, factionBName, '');

    await page.goto('/factions/create');
    await loadFactionDraft(page, factionBName);
    await page.getByRole('textbox', { name: 'Faction name' }).fill(factionAName);
    await page.getByRole('tab', { name: /^Faction leader/ }).click();
    await page.getByRole('textbox', { name: 'Faction leader name' }).fill(factionALeaderName);
    await page.getByRole('button', { name: 'Save faction' }).click();
    await expect(page).toHaveURL(new RegExp(`/factions/${factionAName.toLowerCase()}/edit$`));
    await expect(page.getByRole('heading', { name: `Edit ${factionAName}` })).toBeVisible();
    factionAEditUrl = page.url();

    expect(factionBEditUrl).not.toBe(factionAEditUrl);
  });

  await test.step('loading B into A stays local and Reset restores A', async () => {
    await page.goto(factionAEditUrl);
    await loadFactionDraft(page, factionBName);

    await expect(page.getByRole('textbox', { name: 'Faction name' })).toHaveValue(factionBName);
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Reset unsaved edits' }).click();
    await expect(page.getByRole('textbox', { name: 'Faction name' })).toHaveValue(factionAName);
    await page.getByRole('tab', { name: /^Faction leader/ }).click();
    await expect(page.getByRole('textbox', { name: 'Faction leader name' })).toHaveValue(
      factionALeaderName
    );
  });

  await test.step('warning focus, name blocking, review, and artifact proof use the loaded draft', async () => {
    await loadFactionDraft(page, factionBName);

    await page.getByRole('tab', { name: 'Identity & Appearance', exact: true }).click();
    const warningAction = page.getByRole('button', { name: '1 field may be incomplete' });
    await warningAction.click();
    const factionLeaderName = page.getByRole('textbox', { name: 'Faction leader name' });
    await expect(factionLeaderName).toBeFocused();
    await factionLeaderName.fill(importedLeaderName);

    await page.getByRole('tab', { name: 'Identity & Appearance', exact: true }).click();
    const factionName = page.getByRole('textbox', { name: 'Faction name' });
    await factionName.fill('');
    await expect(page.getByRole('button', { name: 'Save faction' })).toBeDisabled();
    await expect(
      page.getByText('Add a faction name before saving; it determines the faction URL.')
    ).toBeVisible();
    await factionName.fill(factionAName);

    await page
      .getByRole('radiogroup', { name: 'Choose identity artifact proof' })
      .getByText('Faction token', { exact: true })
      .click();
    const token = page.locator('[data-faction-token-proof] > *').first();
    const tokenBounds = await token.boundingBox();
    expect(tokenBounds).not.toBeNull();
    expect(Math.abs((tokenBounds?.width ?? 0) - (tokenBounds?.height ?? 0))).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'Review faction sheet' }).click();
    await expect(page.getByRole('heading', { name: 'Review faction artifacts' })).toBeVisible();
    const reviewScroller = page.locator('[data-faction-review-scroller]');
    await expect
      .poll(async () =>
        reviewScroller.evaluate((element) => element.scrollHeight > element.clientHeight)
      )
      .toBe(true);
    await reviewScroller.evaluate((element) => {
      element.scrollTop = 173;
    });
    const retainedScrollTop = await reviewScroller.evaluate((element) => element.scrollTop);
    expect(retainedScrollTop).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Return to editing', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review faction artifacts' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Review faction sheet' })).toBeFocused();
    await page.getByRole('button', { name: 'Review faction sheet' }).click();
    await expect(reviewScroller).toHaveJSProperty('scrollTop', retainedScrollTop);
    await page.getByRole('button', { name: 'Close faction sheet review' }).click();
  });

  await test.step('saving the loaded draft mutates A and leaves B unchanged', async () => {
    await page.getByRole('button', { name: 'Save faction' }).click();
    await expect(page).toHaveURL(new RegExp(`/factions/${factionAName.toLowerCase()}/edit$`));
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    const savedFactionName = page.getByRole('textbox', { name: 'Faction name' });
    await savedFactionName.fill(`${factionAName} local`);
    await page.getByRole('button', { name: 'Reset unsaved edits' }).click();
    await expect(savedFactionName).toHaveValue(factionAName);

    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Faction name' })).toHaveValue(factionAName);
    await page.getByRole('tab', { name: /^Faction leader/ }).click();
    await expect(page.getByRole('textbox', { name: 'Faction leader name' })).toHaveValue(
      importedLeaderName
    );

    await page.goto(factionBEditUrl);
    await expect(page.getByRole('textbox', { name: 'Faction name' })).toHaveValue(factionBName);
    await page.getByRole('tab', { name: /^Faction leader/ }).click();
    await expect(page.getByRole('textbox', { name: 'Faction leader name' })).toHaveValue('');
  });

  await test.step('the same saved faction becomes a preview-free mobile editor', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(factionAEditUrl);

    await expect(
      page.getByRole('button', { name: 'Review faction sheet', includeHidden: true })
    ).toBeHidden();
    await expect(
      page.getByRole('region', {
        name: 'Background composite live preview',
        includeHidden: true,
      })
    ).toBeHidden();
    await expect(page.getByRole('combobox', { name: 'Faction editor sections' })).toContainText(
      'Identity & Appearance'
    );
    await page.getByRole('button', { name: 'Next section' }).click();
    await expect(page.getByRole('textbox', { name: 'Faction leader name' })).toHaveValue(
      importedLeaderName
    );
  });

  await test.step('the updated target remains discoverable through the catalogue', async () => {
    await page.goto('/factions');
    const updatedFaction = page.getByRole('link', { name: factionAName, exact: true });
    await expect(updatedFaction).toBeVisible({ timeout: 30_000 });

    const search = page.getByRole('textbox', { name: 'Search factions' });
    await search.fill(factionAName);
    await expect(updatedFaction).toBeVisible();

    await search.fill('qwerty');
    await expect(page.getByRole('heading', { name: 'No factions found' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset filters & search' })).toBeVisible();

    await search.fill('');
    await expect(updatedFaction).toBeVisible();
    await updatedFaction.click();
    await expect(page).toHaveURL(new RegExp(`/factions/${factionAName.toLowerCase()}/?$`));
    await expect(page.getByRole('heading', { name: factionAName })).toBeVisible();
  });
});
