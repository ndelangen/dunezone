import preview from '@sb/preview';

import { InventoryStory, expectContainedReferences } from './RulebookLiveReferences.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Inventory/Rendered',
  component: InventoryStory,
  args: { size: 'a4' },
  parameters: { layout: 'centered' },
});

export const IllustratedInventory = meta.story({ play: expectContainedReferences });

export const TallInventory = meta.story({ args: { size: 'tall' }, play: expectContainedReferences });
