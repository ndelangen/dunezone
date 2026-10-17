import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { factionTokenFixtures } from '@game/fixtures/factionTokens';

import { FactionCatalogueSpotlight } from './FactionCatalogueSpotlight';

const meta = preview.meta({
  component: FactionCatalogueSpotlight,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '34rem', maxWidth: '90vw' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    faction: {
      slug: 'house-ecaz',
      data: { name: 'House Ecaz', ...factionTokenFixtures.ecaz },
    },
    label: 'New arrival',
    meta: 'Created Jul 27, 2026',
  },
});

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', { name: 'New arrival House Ecaz Created Jul 27, 2026' });
    await expect(link).toHaveAttribute('href', '/factions/house-ecaz');
    await expect(link.querySelector('use')).toHaveAttribute('xlink:href', '/vector/logo/ecaz.svg#root');
  },
});
