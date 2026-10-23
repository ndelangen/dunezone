import { testingPreview } from '@sb/preview';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { expect } from 'storybook/test';

import { RulebookBlockCanvas } from './RulebookBlockRenderer';
import { techTokenAssets } from './RulebookCardGuides.stories.fixture';
import { IllustrationStory } from './RulebookLiveReferences.shared.stories.fixture';

const meta = testingPreview.meta({
  title: 'Blocks/Illustration/Rendered',
  component: IllustrationStory,
  args: { size: 'a4' },
  parameters: { layout: 'centered' },
});

export const SmallToken = meta.story({
  render: () => (
    <RulebookBlockCanvas
      block={projectRulebookDraftRenderBlock(
        {
          id: 'TECH',
          kind: 'referenced-illustration',
          source: { kind: 'asset', assetId: 'tech' },
          size: 'small',
          caption: 'A token keeps its outline at a smaller size.',
        },
        techTokenAssets
      )}
    />
  ),
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector('img')!;
    await image.decode();
    const bounds = image.getBoundingClientRect();
    await expect(bounds.width / bounds.height).toBeCloseTo(1, 2);
    await expect(getComputedStyle(image).clipPath).toMatch(/^polygon\(/);
  },
});
