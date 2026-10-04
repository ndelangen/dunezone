import preview from '@sb/preview';

import { ComponentEntryStory, expectContained } from './RulebookCardGuides.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Component entry/Rendered',
  component: ComponentEntryStory,
  args: { size: 'a4' },
  parameters: { layout: 'centered' },
});

export const IndividualCard = meta.story({ play: expectContained });
