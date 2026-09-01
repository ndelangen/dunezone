import type { Locator, Page } from '@playwright/test';

import { expect, factionLifecycleTimeoutMs, test } from './coverage';

function factionCard(catalogue: Locator, factionName: string) {
  return catalogue.getByRole('link').filter({ hasText: factionName });
}

async function createFaction(page: Page, name: string, factionLeaderName: string) {
  await page.goto('/factions/create');
  /*
   * The form is proven present before its missing control is read as missing.
   * The app is served as an SPA, so the arriving document is an empty shell and a zero count is satisfied
   * before anything has rendered; this helper runs twice per test, so the unanchored version could never fail.
   */
  const nameField = page.getByRole('textbox', { name: 'Faction name' });
  await expect(nameField).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Group' })).toHaveCount(0);
  await nameField.fill(name);
  await page.getByRole('tab', { name: /^Faction leader/ }).click();
  await page.getByRole('textbox', { name: 'Faction leader name' }).fill(factionLeaderName);
  await page.getByRole('button', { name: 'Save faction' }).click();
  await expect(page).toHaveURL(new RegExp(`/factions/${name.toLowerCase()}/edit$`));
  /* The edit page has no masthead heading anymore (wayfinder #485); the loaded draft is the landmark. */
  await expect(page.getByRole('textbox', { name: 'Faction name' })).toHaveValue(name);
  return page.url();
}

async function loadFactionDraft(page: Page, factionName: string) {
  await page.getByRole('button', { name: 'Load existing faction' }).click();
  /* The flat picker's search input is a searchbox over an always-visible option list (wayfinder #466). */
  const search = page.getByRole('searchbox', { name: 'Search factions' });
  await search.fill(factionName);
  await page.getByRole('option').filter({ hasText: factionName }).click();
  await page.getByRole('button', { name: 'Load faction' }).click();
}

test('owner can author a faction through its complete lifecycle', async ({ page }) => {
  test.setTimeout(factionLifecycleTimeoutMs);
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
    await expect(page.getByRole('textbox', { name: 'Faction name' })).toHaveValue(factionAName);
    factionAEditUrl = page.url();
    await page.goto(`${factionAEditUrl}?notice=default-group-unavailable`);
    await expect(page.getByRole('alert')).toContainText('Saved without its default Group');

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
    await expect(page.getByRole('textbox', { name: 'Faction leader name' })).toHaveValue(factionALeaderName);
  });

  await test.step('warning focus, name blocking, review, and artifact proof use the loaded draft', async () => {
    await loadFactionDraft(page, factionBName);

    await page.getByRole('tab', { name: /^Identity & Appearance/ }).click();
    /* The validation header is open whenever a warning exists, so there is no toolbar count to click through;
       the header's per-source chip is what jumps to and focuses the field. */
    await page.getByRole('button', { name: 'Faction leader: missing name' }).click();
    const factionLeaderName = page.getByRole('textbox', { name: 'Faction leader name' });
    await expect(factionLeaderName).toBeFocused();
    await factionLeaderName.fill(importedLeaderName);

    await page.getByRole('tab', { name: /^Identity & Appearance/ }).click();
    const factionName = page.getByRole('textbox', { name: 'Faction name' });
    await factionName.fill('');
    await expect(page.getByRole('button', { name: 'Save faction' })).toBeDisabled();
    await expect(page.getByText('Add a faction name before saving; it determines the faction URL.')).toBeVisible();
    await factionName.fill(factionAName);

    /* No toggle anymore: the token proof always rides the identity rail (wayfinder #473). */
    const token = page.locator('[data-faction-token-proof] > *').first();
    const tokenBounds = await token.boundingBox();
    expect(tokenBounds).not.toBeNull();
    expect(Math.abs((tokenBounds?.width ?? 0) - (tokenBounds?.height ?? 0))).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'Review faction sheet' }).click();
    await expect(page.getByRole('heading', { name: 'Review faction artifacts' })).toBeVisible();
    const reviewScroller = page.locator('[data-faction-review-scroller]');
    await expect
      .poll(async () => reviewScroller.evaluate((element) => element.scrollHeight > element.clientHeight))
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

    await page.getByRole('tab', { name: /Complexity/ }).click();
    await page.getByRole('switch', { name: 'Set the rating manually' }).click();
    const manualComplexity = page.getByRole('slider', { name: 'Manual complexity rating' });
    await manualComplexity.focus();
    await manualComplexity.press('Home');
    for (let point = 0; point < 7; point += 1) {
      await manualComplexity.press('ArrowRight');
    }
    await expect(manualComplexity).toHaveAttribute('aria-valuenow', '7');
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
    await expect(page.getByRole('textbox', { name: 'Faction leader name' })).toHaveValue(importedLeaderName);
    await page.getByRole('tab', { name: /^Identity & Appearance/ }).click();

    const savedFactionName = page.getByRole('textbox', { name: 'Faction name' });
    await savedFactionName.fill(`${factionAName} local`);
    await page.getByRole('button', { name: 'Reset unsaved edits' }).click();
    await expect(savedFactionName).toHaveValue(factionAName);

    await page.reload();
    /* Same arriving SPA shell as the mobile step below: the draft lands after the shell does. */
    await expect(page.getByRole('textbox', { name: 'Faction name' })).toHaveValue(factionAName, { timeout: 30_000 });
    await page.getByRole('tab', { name: /^Faction leader/ }).click();
    await expect(page.getByRole('textbox', { name: 'Faction leader name' })).toHaveValue(importedLeaderName);
    await page.getByRole('tab', { name: /Complexity/ }).click();
    await expect(page.getByRole('switch', { name: 'Set the rating manually' })).toBeChecked();
    await expect(page.getByRole('slider', { name: 'Manual complexity rating' })).toHaveAttribute('aria-valuenow', '7');

    await page.goto(factionBEditUrl);
    await expect(page.getByRole('textbox', { name: 'Faction name' })).toHaveValue(factionBName, { timeout: 30_000 });
    await page.getByRole('tab', { name: /^Faction leader/ }).click();
    await expect(page.getByRole('textbox', { name: 'Faction leader name' })).toHaveValue('');
  });

  await test.step('the same saved faction becomes a preview-free mobile editor', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(factionAEditUrl);

    /* Wait for the saved draft before interpreting absent controls on the arriving SPA shell. */
    await expect(page.getByRole('textbox', { name: 'Faction name' })).toHaveValue(factionAName, { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Review faction sheet', includeHidden: true })).toBeHidden();
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
    await expect(page.getByRole('textbox', { name: 'Faction leader name' })).toHaveValue(importedLeaderName);
  });

  await test.step('catalogue state stays responsive, canonical, and in one history entry', async () => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/factions?ruleset=missing&variant=prototype');
    await expect(page).toHaveURL(/\/factions\/?$/);

    const catalogue = page.getByRole('main');
    const updatedFaction = factionCard(catalogue, factionAName);
    const otherFaction = factionCard(catalogue, factionBName);
    await expect(updatedFaction).toBeVisible({ timeout: 30_000 });
    await expect(otherFaction).toBeVisible();

    const search = page.getByRole('textbox', { name: 'Search factions' });
    await search.fill(importedLeaderName);
    await expect(updatedFaction).toBeVisible();
    await expect(otherFaction).toBeHidden();
    /* Polled like its positive twin below: a bare read passes on any URL write that has not landed yet, which is the same failure the draft/committed split is here to catch. */
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBeNull();

    await search.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(importedLeaderName);

    await page.getByRole('combobox', { name: 'Sort factions' }).click();
    await page.getByRole('option', { name: 'Chronological (updated)' }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('updated');

    await page.getByRole('button', { name: /^Refine/ }).click();
    await page
      .getByRole('group', { name: 'Filter factions by ruleset' })
      .getByRole('button', { name: /^E2EBaselineRuleset/ })
      .click();
    await page.press('body', 'Escape');
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
    const catalogue = page.getByRole('main');
    const updatedFaction = factionCard(catalogue, factionAName);
    const otherFaction = factionCard(catalogue, factionBName);
    await expect(updatedFaction).toBeVisible();
    await expect(updatedFaction.getByRole('img', { name: 'Expert complexity, 7 out of 10' })).toBeVisible();

    await page.getByRole('button', { name: /^Refine/ }).click();
    const minimumComplexity = page.getByRole('slider', { name: 'Minimum complexity' });
    await minimumComplexity.focus();
    await minimumComplexity.press('Home');
    for (let point = 0; point < 7; point += 1) {
      await minimumComplexity.press('ArrowRight');
    }
    await expect.poll(() => new URL(page.url()).searchParams.get('complexity')).toBe('7-10');
    await expect(updatedFaction).toBeVisible();
    await expect(otherFaction).toBeHidden();

    await page.keyboard.press('Escape');
    await updatedFaction.click();
    await expect(page).toHaveURL(new RegExp(`/factions/${factionAName.toLowerCase()}/?$`));
    await expect(page.getByRole('heading', { name: factionAName })).toBeVisible();
    await expect(page.getByText('7/10 · Expert', { exact: true })).toBeVisible();
  });
});
