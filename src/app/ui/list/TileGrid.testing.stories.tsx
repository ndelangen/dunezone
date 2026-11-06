import { testingPreview } from '@sb/preview';

import { FactionCard } from '../block/FactionCard';
import { expectFactionColumns } from './factionListPlay';
import { TileGrid } from './TileGrid';
import { factions } from './TileGrid.stories.fixture';

const meta = testingPreview.meta({
  title: 'TileGrid',
  component: TileGrid,
  parameters: { layout: 'padded' },
});

const factionCards = (list: typeof factions) => (
  <TileGrid size="card">
    {list.map((faction) => (
      <FactionCard key={faction._id} faction={faction} />
    ))}
  </TileGrid>
);

/** Faction cards on a tablet-wide page are three columns across, however wide that makes each card. */
export const FactionCardsTablet = meta.story({
  render: () => factionCards(factions),
  globals: { viewport: { value: 'appTablet' } },
  play: async ({ canvasElement }) => {
    await expectFactionColumns(canvasElement, 3);
  },
});

/**
 * A single faction card still lays out as a grid cell rather than stretching, which is what keeps a one-result search looking like the same list.
 */
export const FactionCardsSingleEntry = meta.story({
  render: () => factionCards([factions[0]]),
  globals: { viewport: { value: 'appLaptop' } },
  play: async ({ canvasElement }) => {
    /* The laptop window for the reason the faction card story gives: the lone card fills one of the same five tracks. */
    await expectFactionColumns(canvasElement, 5);
  },
});
