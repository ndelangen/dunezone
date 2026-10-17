import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

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
  /* An unclosed emphasis marker stays literal rather than italicising the rest of the block. */
  play: async ({ canvasElement }) => {
    const block = canvasElement.querySelector<HTMLElement>('[data-rulebook-block-id="TEXT"]')!;
    await expect(within(block).getByText(/\*unfinished draft/)).toBeVisible();
    await expect(block.querySelector('em')).toBeNull();
  },
});
