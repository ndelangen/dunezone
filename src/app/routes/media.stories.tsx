import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({ title: 'Media', ...pageStoryMeta });

export const Catalogue = meta.story({ args: { path: '/__media' } });
export const Reclassify = meta.story({
  args: { path: '/__media?kind=decal&group=Decals%20%2F%20Microorganisms' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const flagella = await page.findByRole('checkbox', { name: 'Select Flagella' }, { timeout: 30_000 });
    await userEvent.click(flagella);
    await userEvent.click(page.getByRole('checkbox', { name: 'Select Zenobia' }));
    await userEvent.click(page.getByRole('button', { name: 'Review / bulk move' }));
    await userEvent.type(page.getByRole('combobox', { name: 'Destination group' }), 'Decals / Test proposal');
    await userEvent.click(page.getByRole('button', { name: 'Move selected' }));
    const prompt = page.getByRole('textbox', { name: 'Reclassification prompt' });
    await expect((prompt as HTMLTextAreaElement).value).toContain('/vector/decal/flagella.svg');
    await expect((prompt as HTMLTextAreaElement).value).toContain('/vector/decal/zenobia.svg');
    await expect((prompt as HTMLTextAreaElement).value).toContain('Decals / Microorganisms');
    await expect((prompt as HTMLTextAreaElement).value).toContain('Decals / Test proposal');
    await expect(page.getByText('No matches', { exact: true })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Undo move' }));
    await expect(page.getByRole('link', { name: 'Open Flagella' })).toBeVisible();
    await expect(page.queryByRole('textbox', { name: 'Reclassification prompt' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Reset draft' }));
    await expect(page.getByRole('checkbox', { name: 'Select Flagella' })).not.toBeChecked();
  },
});
export const LeaderLink = meta.story({
  args: { path: '/__media?kind=leader&item=%2Fimage%2Fleader%2Fofficial%2Faramsham.png' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Aramsham' }, { timeout: 30_000 })).resolves.toBeVisible();
    const link = page.getByRole('link', { name: 'Link to this item' });
    await expect(link).toHaveAttribute('href', expect.stringContaining('aramsham.png'));
    await expect(page.getByRole('link', { name: 'Open image file' })).toHaveAttribute(
      'href',
      '/image/leader/official/aramsham-large.webp'
    );
    await userEvent.click(page.getByRole('button', { name: 'Close preview' }));
    await expect(page.queryByRole('link', { name: 'Open image file' })).toBeNull();
  },
});
export const LegacyLink = meta.story({
  args: { path: '/__icons' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).findByRole('heading', { name: 'Media catalogue' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});

export const QuickReclassify = meta.story({
  args: { path: '/__media?kind=decal&group=Decals%20%2F%20Microorganisms' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const card = await page.findByRole('article', { name: 'Flagella' }, { timeout: 30_000 });
    await userEvent.hover(card);
    await userEvent.click(page.getByRole('combobox', { name: 'Group for Flagella' }));
    await userEvent.click(page.getByRole('option', { name: 'Decals / Fluids and containers' }));
    await expect(page.getByRole('button', { name: 'Copy prompt' })).toBeEnabled();
    await expect(page.getByText('0 selected · 1 proposed changes')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Review changes' }));
    await expect(
      (page.getByRole('textbox', { name: 'Reclassification prompt' }) as HTMLTextAreaElement).value
    ).toContain('/vector/decal/flagella.svg');
    await userEvent.click(page.getByRole('button', { name: 'Undo move' }));
    await expect(page.getByRole('article', { name: 'Flagella' })).toBeVisible();
  },
});
