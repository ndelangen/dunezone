import { expect, userEvent, waitFor, within } from 'storybook/test';

/**
 * The shared body of the three stories that prove the background composer's colour-mode memory dies with its draft.
 *
 * They differ only in which page they run on and in what replaces the draft, and the sequence between those two is long enough that three copies of it read as one duplicated block rather than three stories.
 * Pure helpers over the page, no fixtures and no decorators: each story still states its own path, its own setup and its own assertion.
 */
type Page = ReturnType<typeof within>;

const TIMEOUT = { timeout: 30_000 } as const;

/** The composer's mode control for one colour layer, scoped so a page holding two composers cannot answer for the wrong one. */
export async function layerModeControl(page: Page, layer: 'base' | 'pattern') {
  const label = layer === 'base' ? 'Base color mode' : 'Pattern color mode';
  return within(await page.findByRole('radiogroup', { name: label }, TIMEOUT));
}

/** Opens a layer's editor drawer. Only call it while the drawer is closed: the card is a toggle, and clicking an open one closes it. */
export async function openLayerEditor(page: Page, layer: 'base' | 'pattern') {
  await userEvent.click(await page.findByRole('button', { name: `Edit ${layer} color layer` }, TIMEOUT));
}

/** Puts a layer into linear at a stated angle, which is the value the guards later look for. */
export async function craftLinearAngle(page: Page, layer: 'base' | 'pattern', degrees: string) {
  await userEvent.click((await layerModeControl(page, layer)).getByRole('radio', { name: 'Linear' }));
  const angle = await page.findByRole('textbox', { name: 'Gradient angle' }, TIMEOUT);
  await userEvent.clear(angle);
  await userEvent.type(angle, degrees);
  await expect(angle).toHaveValue(`${degrees}°`);
}

/**
 * Leaves linear so the crafted gradient is filed under it.
 * Radial rather than solid on purpose: solid is what these entities are saved wearing, so returning to it leaves the draft clean and disarms the Reset the guards turn on.
 */
export async function flipAwayToRadial(page: Page, layer: 'base' | 'pattern') {
  await userEvent.click((await layerModeControl(page, layer)).getByRole('radio', { name: 'Radial' }));
}

/** Resets the draft and waits for the editor to actually be back on it, rather than for the click to have happened. */
export async function resetAndSettle(page: Page) {
  await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
  await waitFor(() => expect(page.queryByRole('radio', { name: 'Radial', checked: true })).toBeNull(), TIMEOUT);
}

/**
 * The assertion the three guards share: returning to linear derives a fresh 90 rather than restoring the crafted angle.
 * The angle is the subject because both outcomes are a linear gradient and only its shape tells them apart.
 */
export async function expectFreshLinear(page: Page, layer: 'base' | 'pattern') {
  await userEvent.click((await layerModeControl(page, layer)).getByRole('radio', { name: 'Linear' }));
  await expect(page.findByRole('textbox', { name: 'Gradient angle' }, TIMEOUT)).resolves.toHaveValue('90°');
}

/** Which mode a layer's control currently has selected, asked through the checked state rather than a class or data attribute. */
export async function currentLayerMode(page: Page, layer: 'base' | 'pattern'): Promise<string> {
  const control = await layerModeControl(page, layer);
  for (const mode of ['Solid', 'Linear', 'Radial'] as const) {
    if (control.queryByRole('radio', { name: mode, checked: true }) !== null) {
      return mode.toLowerCase();
    }
  }
  return 'solid';
}
