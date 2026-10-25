import { testingPreview } from '@sb/preview';
import { expect } from 'storybook/test';

import { expectFanContained } from './RulebookCardGroup.stories.fixture';
import { CardGroupStory } from './RulebookCardGuides.shared.stories.fixture';

const meta = testingPreview.meta({
  title: 'Blocks/Card group/Rendered',
  component: CardGroupStory,
  args: { treatment: 'compact', size: 'a4' },
  parameters: { layout: 'centered' },
});

export const FourCardFan = meta.story({
  args: { treatment: 'fan', size: 'gf9-expansion', fanCount: 4 },
  play: async (context) => {
    await expectFanContained(context);
    await expect(context.canvasElement.querySelectorAll('.rulebookCardFan img')).toHaveLength(4);
  },
});
