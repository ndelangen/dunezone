import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { WeaponTableStory } from './rulebookIllustratedBook.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Table/Editing',
  parameters: { layout: 'fullscreen' },
});

/** The weapons table renders on the illustrated Battle page with its headers and a row per match. */
export const WeaponsAndDefenses = meta.story({
  render: () => <WeaponTableStory />,
  play: async ({ canvasElement }) => {
    const page = within(within(canvasElement).getByRole('article', { name: 'Rulebook page: Battle' }));
    await expect(page.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Weapon',
      'Defense',
      'Effect of this weapon',
    ]);
    await expect(page.getByRole('row', { name: 'Projectile Shield Stopped' })).toBeVisible();
  },
});
