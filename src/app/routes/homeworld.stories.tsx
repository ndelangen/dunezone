import preview from '@sb/preview';
import { EXAMPLE_HOMEWORLD_CARD } from '@shared/assets/homeworldTemplate';
import { expect, userEvent, within } from 'storybook/test';

import { asset, db } from '@db/storybook';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({ title: 'Assets/Homeworld', ...pageStoryMeta });

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
