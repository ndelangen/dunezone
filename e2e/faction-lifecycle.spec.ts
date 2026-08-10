import type { Page } from '@playwright/test';

import { expect, longSpecTimeoutMs, test } from './coverage';

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

test('owner can author a faction through its complete lifecycle', async ({ page }) => {
  test.setTimeout(longSpecTimeoutMs);
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

    /*
     * Without a reload: the editor must keep showing the just-saved draft, not
     * snap back to the values it loaded the page with.
     */
    await page.getByRole('tab', { name: /^Faction leader/ }).click();
    await expect(page.getByRole('textbox', { name: 'Faction leader name' })).toHaveValue(
      importedLeaderName
    );
    await page.getByRole('tab', { name: 'Identity & Appearance', exact: true }).click();

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

  await test.step('catalogue state stays responsive, canonical, and in one history entry', async () => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/factions?ruleset=missing&variant=prototype');
    await expect(page).toHaveURL(/\/factions\/?$/);

    const catalogue = page.getByRole('main');
    const updatedFaction = catalogue.getByRole('link', { name: factionAName, exact: true });
    const otherFaction = catalogue.getByRole('link', { name: factionBName, exact: true });
    await expect(updatedFaction).toBeVisible({ timeout: 30_000 });
    await expect(otherFaction).toBeVisible();

    const search = page.getByRole('textbox', { name: 'Search factions' });
    await search.fill(importedLeaderName);
    await expect(updatedFaction).toBeVisible();
    await expect(otherFaction).toBeHidden();
    expect(new URL(page.url()).searchParams.get('q')).toBeNull();

    await search.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(importedLeaderName);

    await page.getByRole('combobox', { name: 'Sort factions' }).click();
    await page.getByRole('option', { name: 'Chronological (updated)' }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('updated');

    await page.getByRole('combobox', { name: 'Filter factions by ruleset' }).click();
    await page.getByRole('option', { name: 'E2EBaselineRuleset' }).click();
    await expect(page.getByRole('heading', { name: 'No factions found' })).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters & search' }).click();

    await expect(updatedFaction).toBeVisible();
    await expect(otherFaction).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.toString()).toBe('sort=updated');

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/factions/${factionAName.toLowerCase()}/edit$`));
  });

  await test.step('the updated target remains discoverable through the catalogue', async () => {
    await page.goto('/factions');
    const updatedFaction = page
      .getByRole('main')
      .getByRole('link', { name: factionAName, exact: true });
    await expect(updatedFaction).toBeVisible();
    await updatedFaction.click();
    await expect(page).toHaveURL(new RegExp(`/factions/${factionAName.toLowerCase()}/?$`));
    await expect(page.getByRole('heading', { name: factionAName })).toBeVisible();
  });
});
