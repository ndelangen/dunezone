import preview from '@sb/preview';
import { TouchSurface } from '@ui/surface/TouchSheet';
import { fn } from 'storybook/test';

import { FactionSeating } from './FactionSeating';
import { SEATS } from './FactionSeating.stories.fixture';

const meta = preview.meta({
  title: 'Faction Seating',
  component: FactionSeating,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
  args: { seats: SEATS, onReorder: fn(), onRemove: fn(), onAdd: fn() },
});

export const SeatOrder = meta.story({});

export const TouchSeatOrder = meta.story({
  render: (args) => (
    <TouchSurface>
      <FactionSeating {...args} />
    </TouchSurface>
  ),
});
