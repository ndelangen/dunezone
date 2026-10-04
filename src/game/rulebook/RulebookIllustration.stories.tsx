import preview from '@sb/preview';

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
