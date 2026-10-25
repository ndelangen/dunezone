import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { db } from '@db/storybook';

import { saved, factionWith, FactionExtrasFixture, openExtras } from './FactionExtras.stories.fixture';

const meta = preview.meta({
  title: 'Faction Editor/Extras',
  component: FactionExtrasFixture,
  args: { faction: factionWith(undefined) },
  globals: { viewport: { value: 'appDesktop' } },
  parameters: { layout: 'fullscreen', database: db((baseline) => baseline) },
  beforeEach: () => {
    saved.mockClear();
  },
});

/** A faction saved before Extras existed: no field, nothing added, Save free. */
export const Empty = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = await openExtras(canvasElement);
    await expect(canvas.getByText('No Extras. The faction brings only its own components.')).toBeVisible();
    await expect(canvas.getByText("Nothing beyond the faction's own components.")).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toBeEnabled();
  },
});
