import preview from '@sb/preview';
import { EXAMPLE_HOMEWORLD_CARD } from '@shared/assets/homeworldTemplate';
import { expect, userEvent, within } from 'storybook/test';

import { asset, db } from '@db/storybook';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({ title: 'Assets/Homeworld', ...pageStoryMeta });

export const CreateSaves = meta.story({
  args: { path: '/assets/card-homeworld/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 }), 'My Homeworld');
    await expect(page.queryByRole('textbox', { name: 'Type' })).toBeNull();
    await expect(page.queryByRole('tab', { name: 'Faction' })).toBeNull();
    await userEvent.click(page.getByRole('tab', { name: 'Planet' }));
    const size = page.getByRole('slider', { name: 'Planet size slider' });
    size.focus();
    await userEvent.keyboard('{Home}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    await expect(page.getByRole('textbox', { name: 'Planet size' })).toHaveValue('0.8');
    await userEvent.click(page.getByRole('tab', { name: 'Effects' }));
    const threshold = page.getByRole('textbox', { name: 'High reserve threshold' });
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '8');
    for (const label of ['High reserves', 'Low reserves', 'Occupied']) {
      await userEvent.type(page.getByRole('textbox', { name: label }), `Custom ${label} effect.`);
    }
    const strength = page.getByRole('textbox', { name: 'Low reserves strength' });
    await userEvent.clear(strength);
    await userEvent.type(strength, '1');
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await expect(page.findByRole('button', { name: 'Delete card' }, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('tab', { name: 'Planet' }));
    await expect(page.getByRole('textbox', { name: 'Planet size' })).toHaveValue('0.8');
    await userEvent.click(page.getByRole('tab', { name: 'Effects' }));
    await expect(page.getByRole('textbox', { name: 'High reserve threshold' })).toHaveValue('8');
    await expect(page.getByRole('textbox', { name: 'Low reserves strength' })).toHaveValue('1');
    await expect(page.getByRole('textbox', { name: 'Occupied' })).toHaveValue('Custom Occupied effect.');
  },
});

export const Edit = meta.story({
  args: { path: '/assets/card-homeworld/pelagos/edit' },
  parameters: {
    database: db((baseline) => {
      baseline.assets.push(asset({ type: 'card-homeworld', data: EXAMPLE_HOMEWORLD_CARD }));
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 })).resolves.toHaveValue('Pelagos');
    await userEvent.click(page.getByRole('tab', { name: 'Effects' }));
    await expect(page.getByRole('textbox', { name: 'High reserves strength' })).toHaveValue('3');
    await expect(page.getByRole('textbox', { name: 'Low reserves strength' })).toHaveValue('1');
  },
});
