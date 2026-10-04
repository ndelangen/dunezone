import preview from '@sb/preview';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { expect } from 'storybook/test';

import { RulebookBlockCanvas } from './RulebookBlockRenderer';
import { techTokenAssets } from './RulebookCardGuides.stories.fixture';
import { IllustrationStory, expectContainedReferences } from './RulebookLiveReferences.shared.stories.fixture';
import { rulesLayout, renderFixturePreview } from './RulebookRendering.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Illustration/Rendered',
  component: IllustrationStory,
  args: { size: 'a4' },
  parameters: { layout: 'centered' },
});

export const ReferencedBoard = meta.story({ play: expectContainedReferences });

export const MissingSource = meta.story({
  decorators: [
    (Story) => (
      <div style={{ width: 'min(42rem, 92vw)', aspectRatio: '210 / 297' }}>
        <Story />
      </div>
    ),
  ],
  render: () =>
    renderFixturePreview(
      {
        pageId: 'RULE',
        regionKey: rulesLayout.regions[1].key,
        blockId: 'ASST',
        kind: 'referenced-illustration',
      },
      (block) => (block.source = { status: 'unavailable', reference: { kind: 'asset', assetId: 'Storm marker' } })
    ),
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
    expect(bounds.width / bounds.height).toBeCloseTo(1, 2);
    expect(getComputedStyle(image).clipPath).toMatch(/^polygon\(/);
  },
});
