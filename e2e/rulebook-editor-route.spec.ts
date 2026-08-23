import { expect, test } from './coverage';

test('the local Rulebook editor keeps its A4 preview synchronized', async ({ page }) => {
  await page.goto('/rulesets/local-rules/rulebooks/starter/edit');

  await expect(page.getByRole('heading', { name: 'Edit starter' })).toBeVisible();
  await expect(page.getByText('It does not load from or save to the database.')).toBeVisible();

  const preview = page.getByRole('region', { name: 'Rulebook page preview' });
  await expect(preview).toBeVisible();

  await page.getByText('Edit page', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Text block' }).fill('A browser-local Rulebook revision.');

  await expect(preview).toContainText('A browser-local Rulebook revision.');
});
