import { testingPreview } from '@sb/preview';

import { FactionList } from './FactionList';
import { factions } from './FactionList.stories.fixture';
import { expectFactionColumns } from './factionListPlay';

const meta = testingPreview.meta({
  component: FactionList,
  parameters: { layout: 'padded' },
  args: { factions },
  argTypes: { className: { control: false } },
});

/** A list as wide as a tablet's page is three columns across, however wide that makes each card. */
export const Tablet = meta.story({
  globals: { viewport: { value: 'appTablet' } },
  play: async ({ canvasElement }) => {
    await expectFactionColumns(canvasElement, 3);
  },
});

/**
 * A single entry still lays out as a grid cell rather than stretching, which is what keeps a one-result search looking like the same list.
 */
export const SingleEntry = meta.story({
  args: { factions: [factions[0]] },
  globals: { viewport: { value: 'appLaptop' } },
  play: async ({ canvasElement }) => {
    /* The laptop window for the reason `Default` gives: the lone card fills one of the same five tracks. */
    await expectFactionColumns(canvasElement, 5);
  },
});
