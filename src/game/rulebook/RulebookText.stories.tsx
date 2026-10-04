import preview from '@sb/preview';

import { rulesLayout, renderFixturePreview } from './RulebookRendering.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Text/Rendered',
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 'min(42rem, 92vw)', aspectRatio: '210 / 297' }}>
        <Story />
      </div>
    ),
  ],
});

export const InvalidLocalText = meta.story({
  render: () =>
    renderFixturePreview(
      {
        pageId: 'RULE',
        regionKey: rulesLayout.regions[0].key,
        blockId: 'TEXT',
        kind: 'text',
      },
      (block) => (block.text = 'An *unfinished draft stays visible as literal text.')
    ),
});
