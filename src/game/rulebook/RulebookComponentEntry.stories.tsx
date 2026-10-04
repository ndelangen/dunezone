import preview from '@sb/preview';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { expect } from 'storybook/test';

import { RulebookBlockCanvas } from './RulebookBlockRenderer';
import { ComponentEntryStory, expectContained } from './RulebookCardGuides.shared.stories.fixture';
import { techTokenAssets } from './RulebookCardGuides.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Component entry/Rendered',
  component: ComponentEntryStory,
  args: { size: 'a4' },
  parameters: { layout: 'centered' },
});

export const IndividualCard = meta.story({ play: expectContained });

export const TechToken = meta.story({
  render: () => (
    <RulebookBlockCanvas
      block={projectRulebookDraftRenderBlock(
        {
          id: 'TECH',
          kind: 'card-entry',
          source: { kind: 'asset', assetId: 'tech' },
          text: 'The illustration keeps the token outline supplied by its asset type.',
        },
        techTokenAssets
      )}
    />
  ),
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector('img')!;
    await image.decode();
    const bounds = image.getBoundingClientRect();
    expect(bounds.width / bounds.height).toBeCloseTo(1, 2);
    expect(getComputedStyle(image).clipPath).toMatch(/^polygon\(/);
  },
});
