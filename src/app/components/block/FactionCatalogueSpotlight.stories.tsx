import preview from '@sb/preview';

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

export const Default = meta.story({});
